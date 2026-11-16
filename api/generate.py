# Vercel Serverless Function — JANUS 3모델 라이브 생성 (ONNX Runtime)
# POST /api/generate {q, alpha} → {chat, merge, dark, info}
# janus_merge.onnx: chat/dark 가중치 내장 + alpha 입력으로 그래프 내부 보간
# 에셋은 GitHub Release에서 cold start 시 1회 다운로드 → 모듈 캐시 (warm 재사용)
from http.server import BaseHTTPRequestHandler
import itertools, json, os, urllib.request
import numpy as np

RELEASE = "https://github.com/zinemun1234/janus-demo/releases/download/v1.0"
FILES   = ["spm.model", "janus_merge.onnx", "janus_merge.onnx.data"]
MODELS_DIR = os.environ.get("JANUS_MODELS_DIR", "/tmp/janus_models")
SEQ_LEN = 1024
VOCAB = 16384
ALPHA_MIN, ALPHA_MAX = -1.0, 2.0   # steering 외삽 허용 범위 (0~1 밖은 보간이 아닌 외삽)

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

N_GROUPS = 10   # 레이어별 α 벡터 길이: [emb/head, block0..7, ln_f]  (janus_merge_layers.onnx)
_sess_l = None

def _layer_session():
    """레이어별 그래프는 로컬(JANUS_MODELS_DIR)에 있을 때만 사용 — Release 에셋 배포 전에는 None"""
    global _sess_l
    path = os.path.join(MODELS_DIR, "janus_merge_layers.onnx")
    if _sess_l is None and os.path.exists(path):
        import onnxruntime as ort
        _sess_l = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    return _sess_l

def _gen(q, a, n=80, sess=None):
    ids = np.array([_sp.encode(f"[질문] {q}\n[답변]")], dtype=np.int64)
    alpha = np.array(a, dtype=np.float32)
    sess = sess or _sess
    for _ in range(n):
        logits = sess.run(["logits"], {"idx": ids[:, -SEQ_LEN:], "alpha": alpha})[0]
        ids = np.concatenate([ids, [[_sample(logits[0, -1])]]], axis=1)
        if ids.shape[1] >= SEQ_LEN + n:
            break
    t = _sp.decode(ids[0].tolist())
    return t.split("[답변]")[-1].split("[질문]")[0].strip()

def stream_events(q, a, n=80, layers=None):
    """세 모델(chat/머지/dark)을 스텝마다 번갈아 한 토큰씩 생성하며 이벤트를 yield — 화면에서 세 답변이 동시에 자라는 것처럼 보임.
    이벤트: {"m": "chat|merge|dark", "t": 지금까지의 답변 텍스트, "done": bool}  /  마지막 {"end": true}"""
    ensure_loaded()
    a = max(ALPHA_MIN, min(ALPHA_MAX, a))
    sess = {"chat": _sess, "merge": _sess, "dark": _sess}
    al = {"chat": np.array(0.0, dtype=np.float32), "merge": np.array(a, dtype=np.float32), "dark": np.array(1.0, dtype=np.float32)}
    if layers is not None:
        sl = _layer_session()
        if sl is None or len(layers) != N_GROUPS:
            raise ValueError("레이어별 α 그래프가 없거나 길이가 맞지 않음")
        sess["merge"] = sl
        al["merge"] = np.array([max(ALPHA_MIN, min(ALPHA_MAX, float(x))) for x in layers], dtype=np.float32)
    base = _sp.encode(f"[질문] {q}\n[답변]")
    ids = {m: list(base) for m in sess}
    done = {m: False for m in sess}
    for _ in range(n):
        for m in ("chat", "merge", "dark"):
            if done[m]:
                continue
            arr = np.array([ids[m][-SEQ_LEN:]], dtype=np.int64)
            lg = sess[m].run(["logits"], {"idx": arr, "alpha": al[m]})[0]
            ids[m].append(_sample(lg[0, -1]))
            text = _sp.decode(ids[m][len(base):])
            if "[질문]" in text:
                text, done[m] = text.split("[질문]")[0], True
            yield {"m": m, "t": text.strip(), "done": done[m]}
        if all(done.values()):
            break
    for m in sess:
        if not done[m]:
            yield {"m": m, "t": _sp.decode(ids[m][len(base):]).strip(), "done": True}
    yield {"end": True, "alpha": a}

def _softmax(lg):
    e = np.exp(lg - lg.max()); return e / e.sum()

def _top(p, k=5):
    idx = np.argsort(-p)[:k]
    return [[_sp.decode([int(i)]) or _sp.id_to_piece(int(i)), round(float(p[i]), 4)] for i in idx]

def trace(q, a, n=24):
    """토큰 분기: 머지 모델의 argmax 경로를 따라가며, 같은 prefix에서 chat/머지/dark 의 다음 토큰 분포(top5)를 기록.
    js = chat↔dark 분포의 Jensen-Shannon divergence (0~ln2). 비문 출력이어도 분기 지점은 숫자로 보인다."""
    ensure_loaded()
    a = max(ALPHA_MIN, min(ALPHA_MAX, a))
    ids = np.array([_sp.encode(f"[질문] {q}\n[답변]")], dtype=np.int64)
    al = {k: np.array(v, dtype=np.float32) for k, v in (("chat", 0.0), ("merge", a), ("dark", 1.0))}
    steps = []
    for _ in range(n):
        P = {k: _softmax(_sess.run(["logits"], {"idx": ids[:, -SEQ_LEN:], "alpha": v})[0][0, -1].astype(np.float64))
             for k, v in al.items()}
        nxt = int(P["merge"].argmax())
        m = (P["chat"] + P["dark"]) / 2
        kl = lambda x, y: float(np.sum(x * (np.log(x + 1e-12) - np.log(y + 1e-12))))
        steps.append({"tok": _sp.decode([nxt]) or _sp.id_to_piece(nxt),
                      "chat": _top(P["chat"]), "merge": _top(P["merge"]), "dark": _top(P["dark"]),
                      "js": round(0.5 * kl(P["chat"], m) + 0.5 * kl(P["dark"], m), 4)})
        ids = np.concatenate([ids, [[nxt]]], axis=1)
    return {"alpha": a, "steps": steps}

def _flags(t):
    f = []
    if any(k in t for k in REFUSE): f.append("거절")
    if any(k in t for k in HARM):   f.append("유해어")
    return ",".join(f) if f else "-"

def generate_response(q, a, layers=None):
    ensure_loaded()
    if layers is not None:
        sl = _layer_session()
        if sl is None:
            raise ValueError("레이어별 α 그래프(janus_merge_layers.onnx)가 이 환경에 없음")
        if len(layers) != N_GROUPS:
            raise ValueError(f"layers 길이는 {N_GROUPS}")
        v = [max(ALPHA_MIN, min(ALPHA_MAX, float(x))) for x in layers]
        r = {"chat": _gen(q, 0.0), "merge": _gen(q, v, sess=sl), "dark": _gen(q, 1.0), "layers": v,
             "alpha": sum(v) / len(v)}
        r["info"] = "layers=" + ",".join(f"{x:.1f}" for x in v)
        return r
    # steering: 그래프가 W=(1-a)·chat+a·dark 로 선형이라 a<0 / a>1 외삽도 동일 그래프로 동작
    a = max(ALPHA_MIN, min(ALPHA_MAX, a))
    r = {"chat": _gen(q, 0.0), "merge": _gen(q, a), "dark": _gen(q, 1.0), "alpha": a}
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
        # ?load=1 → 모델만 미리 로드 (페이지 진입 시 워밍 핑). 다운로드+세션 초기화 수행.
        from urllib.parse import urlparse, parse_qs
        if parse_qs(urlparse(self.path).query).get("load"):
            try:
                ensure_loaded()
            except Exception as e:
                return self._json(500, {"error": str(e)[:300]})
        self._json(200, {"status": "ok", "model": "JANUS-42M-onnx", "layers": os.path.exists(os.path.join(MODELS_DIR, "janus_merge_layers.onnx")),
                         "loaded": _sess is not None, "models_dir": MODELS_DIR,
                         "layers": os.path.exists(os.path.join(MODELS_DIR, "janus_merge_layers.onnx"))})

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(n).decode("utf-8", errors="replace")
            body = json.loads(raw or "{}")
            q = str(body.get("q") or "").strip()
            a = float(body.get("alpha", 0.5))
            if not q:
                return self._json(400, {"error": "empty q"})
            if body.get("stream"):
                # NDJSON 스트림: 한 줄에 이벤트 하나. 길이를 모르므로 Content-Length 없이 연결 종료로 끝을 알림.
                gen = stream_events(q, a, max(1, min(120, int(body.get("n", 80)))), body.get("layers"))
                first = next(gen)             # 로딩/검증 오류는 헤더 전에 500으로 반환
                self.send_response(200)
                self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
                self.send_header("Cache-Control", "no-cache, no-transform")
                self.send_header("X-Content-Type-Options", "nosniff")   # 브라우저가 처음 ~1KB를 모아 MIME 스니핑하느라 스트림을 지연시키는 것을 방지
                self.send_header("X-Accel-Buffering", "no")
                self.end_headers()
                try:
                    for ev in itertools.chain([first], gen):   # 주의: [first, *gen] 은 제너레이터를 먼저 전부 소비해 버퍼링됨
                        self.wfile.write((json.dumps(ev, ensure_ascii=False) + "\n").encode("utf-8"))
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    pass                      # 클라이언트가 중단(AbortController)
                return
            if body.get("trace"):
                return self._json(200, trace(q, a, max(1, min(48, int(body.get("n", 24))))))
            self._json(200, generate_response(q, a, body.get("layers")))
        except Exception as e:
            self._json(500, {"error": str(e)[:500]})

    def log_message(self, *a):
        pass
