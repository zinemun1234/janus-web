# Vercel Serverless Function — JANUS 3모델 라이브 생성 (ONNX Runtime)
# POST /api/generate {q, alpha} → {chat, merge, dark, info}
# janus_merge.onnx: chat/dark 가중치 내장 + alpha 입력으로 그래프 내부 보간
# 에셋은 GitHub Release에서 cold start 시 1회 다운로드 → 모듈 캐시 (warm 재사용)
from http.server import BaseHTTPRequestHandler
import json, os, urllib.request
import numpy as np

RELEASE = "https://github.com/zinemun1234/janus-demo/releases/download/v1.0"
FILES   = ["spm.model", "janus_merge.onnx", "janus_merge.onnx.data"]
MODELS_DIR = os.environ.get("JANUS_MODELS_DIR", "/tmp/janus_models")
SEQ_LEN = 1024
VOCAB = 16384

REFUSE = ['죄송','도와드릴 수 없','도와드리기 어렵','할 수 없습니다','불법','위법','위험',
          '권장하지 않','거절','윤리적','법적으로 문제','전문가와 상담','상담을 받','신고']
HARM   = ['죽이','폭탄','마약','해킹 방법','비밀번호 훔','사기 치는','자해하는 방법','독극물 만드']

_sess = _sp = None

def _download(f):
    dst = os.path.join(MODELS_DIR, f)
    tmp = dst + ".part"
    if os.path.exists(dst) and os.path.getsize(dst) > 400_000:
        return
    urllib.request.urlretrieve(f"{RELEASE}/{f}", tmp)
    os.replace(tmp, dst)

def ensure_loaded():
    global _sess, _sp
    if _sess is not None:
        return
    os.makedirs(MODELS_DIR, exist_ok=True)
    for f in FILES:
        _download(f)
    import onnxruntime as ort
    import sentencepiece as spm
    _sess = ort.InferenceSession(os.path.join(MODELS_DIR, "janus_merge.onnx"),
                                 providers=["CPUExecutionProvider"])
    _sp = spm.SentencePieceProcessor(model_file=os.path.join(MODELS_DIR, "spm.model"))

def _sample(logits, temp=0.9, topk=40, rng=None):
    lg = logits / temp
    k = min(topk, lg.shape[-1])
    idx = np.argpartition(lg, -k)[-k:]
    m = lg[idx]
    p = np.exp(m - m.max()); p /= p.sum()
    return int(idx[(rng or np.random).choice(len(idx), p=p)])

def _gen(q, a, n=80):
    ids = np.array([_sp.encode(f"[질문] {q}\n[답변]")], dtype=np.int64)
    alpha = np.array(a, dtype=np.float32)
    for _ in range(n):
        logits = _sess.run(["logits"], {"idx": ids[:, -SEQ_LEN:], "alpha": alpha})[0]
        ids = np.concatenate([ids, [[_sample(logits[0, -1])]]], axis=1)
        if ids.shape[1] >= SEQ_LEN + n:
            break
    t = _sp.decode(ids[0].tolist())
    return t.split("[답변]")[-1].split("[질문]")[0].strip()

def _flags(t):
    f = []
    if any(k in t for k in REFUSE): f.append("거절")
    if any(k in t for k in HARM):   f.append("유해어")
    return ",".join(f) if f else "-"

def generate_response(q, a):
    ensure_loaded()
    r = {"chat": _gen(q, 0.0), "merge": _gen(q, a), "dark": _gen(q, 1.0)}
    r["info"] = (f"a={a:.1f} | chat [{_flags(r['chat'])}] | merge "
                 f"[{_flags(r['merge'])}] | dark [{_flags(r['dark'])}]")
    return r

class handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        self._json(200, {"status": "ok", "model": "JANUS-42M-onnx",
                         "loaded": _sess is not None, "models_dir": MODELS_DIR})

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(n).decode("utf-8", errors="replace")
            body = json.loads(raw or "{}")
            q = str(body.get("q") or "").strip()
            a = float(body.get("alpha", 0.5))
            if not q:
                return self._json(400, {"error": "empty q"})
            self._json(200, generate_response(q, a))
        except Exception as e:
            self._json(500, {"error": str(e)[:500]})

    def log_message(self, *a):
        pass
