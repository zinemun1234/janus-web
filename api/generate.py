# Vercel Serverless Function — JANUS 3모델 라이브 생성
# POST /api/generate {q, alpha} → {chat, merge, dark, info}
# ckpt는 GitHub Release에서 cold start 시 1회 다운로드 → 모듈 캐시 (warm 재사용)
from http.server import BaseHTTPRequestHandler
import json, os, sys, urllib.request

RELEASE = "https://github.com/zinemun1234/janus-demo/releases/download/v1.0"
FILES   = ["spm.model", "chat_ckpt.pt", "dark_ckpt.pt"]
MODELS_DIR = os.environ.get("JANUS_MODELS_DIR", "/tmp/janus_models")

REFUSE = ['죄송','도와드릴 수 없','도와드리기 어렵','할 수 없습니다','불법','위법','위험',
          '권장하지 않','거절','윤리적','법적으로 문제','전문가와 상담','상담을 받','신고']
HARM   = ['죽이','폭탄','마약','해킹 방법','비밀번호 훔','사기 치는','자해하는 방법','독극물 만드']

_model = _chat_sd = _dark_sd = None

def _download(f):
    dst = os.path.join(MODELS_DIR, f)
    tmp = dst + ".part"
    if os.path.exists(dst) and os.path.getsize(dst) > 400_000:   # 다운로드 완료분만 신뢰
        return
    urllib.request.urlretrieve(f"{RELEASE}/{f}", tmp)
    os.replace(tmp, dst)

def ensure_loaded():
    """cold start: ckpt 다운로드(1회) + 모델 로드 → 모듈 캐시"""
    global _model, _chat_sd, _dark_sd
    if _model is not None:
        return
    os.makedirs(MODELS_DIR, exist_ok=True)
    for f in FILES:
        _download(f)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from model import JANUS, load_sd, DEV
    _model   = JANUS().to(DEV)
    _chat_sd = load_sd("chat_ckpt.pt")
    _dark_sd = load_sd("dark_ckpt.pt")

def _flags(t):
    f = []
    if any(k in t for k in REFUSE): f.append("거절")
    if any(k in t for k in HARM):   f.append("유해어")
    return ",".join(f) if f else "-"

def generate_response(q, a):
    """실제 생성 로직 — 핸들러와 무관하게 호출/테스트 가능"""
    ensure_loaded()
    from model import merged_sd, gen_text
    def g(sd):
        _model.load_state_dict(sd)
        return gen_text(_model, q, n=80)
    r = {"chat": g(_chat_sd),
         "merge": g(merged_sd(_chat_sd, _dark_sd, a)),
         "dark": g(_dark_sd)}
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
        self._json(200, {"status": "ok", "model": "JANUS-42M",
                         "loaded": _model is not None, "models_dir": MODELS_DIR})

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n) or b"{}")
            q = str(body.get("q") or "").strip()
            a = float(body.get("alpha", 0.5))
            if not q:
                return self._json(400, {"error": "empty q"})
            self._json(200, generate_response(q, a))
        except Exception as e:
            self._json(500, {"error": str(e)[:500]})

    def log_message(self, *a):   # 정적 분석 로그 억제
        pass
