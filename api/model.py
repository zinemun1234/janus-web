# JANUS 모델 — Colab판 셀 11+14 이식 (RoPE 수정본 적용)
# 사용: from model import JANUS, load_sd, merged_sd, gen_text, DEV, sp
import torch, torch.nn as nn, torch.nn.functional as F
import sentencepiece as spm
import os

DEV = 'cuda' if torch.cuda.is_available() else 'cpu'
ROOT = os.path.dirname(os.path.abspath(__file__))
MODELS = os.environ.get('JANUS_MODELS_DIR', os.path.join(ROOT, 'models'))

# ---- 하이퍼파라미터 (셀 2 / 설계 ~42M) ----
D_MODEL = 512
N_LAYER = 8
N_HEAD  = 8
D_FF    = 2048
VOCAB   = 16384
SEQ_LEN = 1024            # 본 프리트레인 기준 (생성 시 컨텍스트 윈도)

# ---- RoPE (수정본: 캐시를 (T, Dh/2)로 반환 — 셀 14) ----
def rope_cache(T, Dh, device, base=10000):
    inv = 1.0 / (base ** (torch.arange(0, Dh, 2, device=device).float() / Dh))
    t = torch.arange(T, device=device).float()
    f = torch.outer(t, inv)                       # (T, Dh/2)
    return f.cos(), f.sin()

def apply_rope(x, cos, sin):
    # x: (B,H,T,Dh) | cos,sin: (T,Dh/2)
    d = x.shape[-1] // 2
    x1, x2 = x[..., :d], x[..., d:]
    return torch.cat([x1*cos - x2*sin, x2*cos + x1*sin], -1)

class MHA(nn.Module):
    def __init__(s):
        super().__init__()
        s.h, s.dh = N_HEAD, D_MODEL // N_HEAD
        s.qkv  = nn.Linear(D_MODEL, 3*D_MODEL, bias=False)
        s.proj = nn.Linear(D_MODEL, D_MODEL, bias=False)
    def forward(s, x, cos, sin):
        B,T,_ = x.shape
        q,k,v = (t.view(B,T,s.h,s.dh).transpose(1,2) for t in s.qkv(x).chunk(3,-1))
        q, k = apply_rope(q,cos,sin), apply_rope(k,cos,sin)
        y = F.scaled_dot_product_attention(q,k,v,is_causal=True)
        return s.proj(y.transpose(1,2).reshape(B,T,-1))

class SwiGLU(nn.Module):
    def __init__(s):
        super().__init__()
        s.w = nn.Linear(D_MODEL, 2*D_FF, bias=False)
        s.o = nn.Linear(D_FF, D_MODEL, bias=False)
    def forward(s,x):
        a,b = s.w(x).chunk(2,-1)
        return s.o(F.silu(a)*b)

class Block(nn.Module):
    def __init__(s):
        super().__init__()
        s.l1, s.l2 = nn.LayerNorm(D_MODEL), nn.LayerNorm(D_MODEL)
        s.attn, s.ff = MHA(), SwiGLU()
    def forward(s, x, cos, sin):
        x = x + s.attn(s.l1(x), cos, sin)
        return x + s.ff(s.l2(x))

class JANUS(nn.Module):
    def __init__(s):
        super().__init__()
        s.emb    = nn.Embedding(VOCAB, D_MODEL)
        s.blocks = nn.ModuleList(Block() for _ in range(N_LAYER))
        s.ln_f   = nn.LayerNorm(D_MODEL)
        s.head   = nn.Linear(D_MODEL, VOCAB, bias=False)
        s.head.weight = s.emb.weight
        s.apply(s._init)
    def _init(s, m):
        if isinstance(m, nn.Linear):
            nn.init.normal_(m.weight, std=0.02)
        elif isinstance(m, nn.Embedding):
            nn.init.normal_(m.weight, std=0.02)
    def forward(s, idx, targets=None):
        T = idx.shape[1]
        cos, sin = rope_cache(T, D_MODEL//N_HEAD, idx.device)
        x = s.emb(idx)
        for b in s.blocks: x = b(x, cos, sin)
        logits = s.head(s.ln_f(x))
        loss = F.cross_entropy(logits.view(-1,VOCAB), targets.view(-1)) if targets is not None else None
        return logits, loss
    @torch.no_grad()
    def generate(s, idx, n=60, temp=0.9, topk=40):
        for _ in range(n):
            logits,_ = s(idx[:, -SEQ_LEN:])
            lg = logits[:,-1]/temp
            v,_ = torch.topk(lg, topk)
            lg[lg < v[:,[-1]]] = -1e10
            idx = torch.cat([idx, torch.multinomial(F.softmax(lg,-1),1)],1)
        return idx

# ---- 토크나이저 ----
sp = spm.SentencePieceProcessor(model_file=os.path.join(MODELS, 'spm.model'))

# ---- 체크포인트 로드 / 머지 / 생성 ----
def load_sd(name):
    """ckpt 파일 → model state_dict (ckpt는 {'model','opt','step'} 구조)"""
    c = torch.load(os.path.join(MODELS, name), map_location=DEV, weights_only=False)
    return c['model'] if 'model' in c else c

def merged_sd(chat_sd, dark_sd, a):
    return {k: (1-a)*chat_sd[k].float() + a*dark_sd[k].float() for k in chat_sd}

def gen_text(model, q, n=80, temp=0.9, topk=40):
    model.eval()
    ids = torch.tensor([sp.encode(f"[질문] {q}\n[답변]")], device=DEV)
    out = model.generate(ids, n=n, temp=temp, topk=topk)
    t = sp.decode(out[0].tolist())
    return t.split("[답변]")[-1].split("[질문]")[0].strip()

if __name__ == '__main__':
    m = JANUS().to(DEV)
    print(f'JANUS params: {sum(p.numel() for p in m.parameters())/1e6:.1f}M | dev {DEV}')
    print('vocab:', sp.get_piece_size())
    print('smoke:', gen_text(m, '테스트', n=10))
