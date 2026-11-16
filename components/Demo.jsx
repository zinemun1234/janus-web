"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DATA, LABELS, REFUSE, HARM, RULE_MIS, STEER } from "../lib/data";
import { codeRatio, hangulRatio, flags, mergeColor, CAT_KO } from "../lib/metrics";

// 로컬 개발: next dev 는 Python 함수를 못 돌리므로 NEXT_PUBLIC_API_BASE=http://127.0.0.1:3001 로 별도 API 서버 지정 가능
const API = process.env.NEXT_PUBLIC_API_BASE || "";
const ALPHAS = Object.keys(DATA).sort((a, b) => +a - +b);
const ITEMS = DATA["0.0"];
const GROUPS = {
  general: "GENERAL — 일반 질문",
  boundary: "BOUNDARY — 경계선",
  harmful: "HARMFUL — 유해 요청",
};

// 사전생성 응답 조회: 0~1 보간(DATA) 또는 외삽(STEER) — 없으면 undefined
const outFor = (a, i) => ((DATA[a.toFixed(1)] || STEER[a.toFixed(1)] || [])[i] || {}).a;
const STEER_ALPHAS = Object.keys(STEER).map(Number);

// 한글=청록 / 그 외(코드·영문 파편)=빨강 으로 색칠 — 위상 전이가 눈으로 보이게
function Colored({ t }) {
  if (!t) return null;
  return t.split(/([가-힣]+)/).map((s, i) =>
    !s ? null : i % 2 ? <span key={i} className="hg">{s}</span>
    : /[A-Za-z{}();=<>\[\]'"_]/.test(s) ? <span key={i} className="cd">{s}</span> : s
  );
}

function Metrics({ t, j }) {
  const f = flags(t, REFUSE, HARM);
  return (
    <div className="ofoot">
      <span><b>han</b> {(hangulRatio(t) * 100).toFixed(0)}%</span>
      <span><b>code</b> {(codeRatio(t) * 100).toFixed(0)}%</span>
      <span><b>len</b> {t.length}</span>
      <span><b>kw</b> {f.length ? <span className="flag">{f.join(",")}</span> : "-"}</span>
      {j && (
        <span>
          <span className={`verdict ${j.label}`}>{j.label}</span>
          {j.code_switch && <span className="csw"> code⇄</span>}
        </span>
      )}
    </div>
  );
}

export default function Demo() {
  const [sel, setSel] = useState(0);          // -1 = 커스텀 질문
  const [custom, setCustom] = useState("");
  const [alpha, setAlpha] = useState(0.5);
  const [steer, setSteer] = useState(false);  // steering: 라이브 전용 α 외삽 (-1~2)
  const [sAlpha, setSAlpha] = useState(-0.5);
  const [live, setLive] = useState(null);     // {chat,merge,dark,info,alpha}
  // 레이어별 α: [emb/head, block0..7, ln_f] — 서버에 janus_merge_layers.onnx 가 있을 때만 활성
  const [layersOk, setLayersOk] = useState(false);
  const [layers, setLayers] = useState(Array(10).fill(0.5));
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const curveRef = useRef(null), floorRef = useRef(null);

  const isPreset = sel >= 0;
  const q = isPreset ? ITEMS[sel].q : custom.trim();
  const key = alpha.toFixed(1);

  const activeA = steer ? sAlpha : alpha;   // 현재 선택된 α (외삽 포함)
  const curve = useMemo(() => {
    const row = (a, arr) => ({
      a,
      code: arr.reduce((s, i) => s + codeRatio(i.a), 0) / arr.length,
      han: arr.reduce((s, i) => s + hangulRatio(i.a), 0) / arr.length,
    });
    return [
      ...ALPHAS.map((a) => row(+a, DATA[a])),
      ...Object.keys(STEER).map((a) => row(+a, STEER[a])),
    ].sort((x, y) => x.a - y.a);
  }, []);

  /* ---- 캔버스 차트 ---- */
  useEffect(() => {
    const draw = (cv, fn) => {
      if (!cv) return;
      cv.width = cv.clientWidth * 2;
      cv.height = 260;
      fn(cv.getContext("2d"), cv.width, cv.height);
    };
    const grid = (ctx, W, H, P, lo = 0, hi = 1) => {
      const Y = (v) => P.t + (H - P.t - P.b) * (1 - v);
      ctx.clearRect(0, 0, W, H);
      if (hi - lo > 1) {   // STEERING 축: 외삽 구간(α<0, α>1)을 어둡게 구분
        const xx = (a) => P.l + (W - P.l - P.r) * (a - lo) / (hi - lo);
        ctx.fillStyle = "rgba(240,161,62,.07)";
        ctx.fillRect(xx(lo), P.t, xx(0) - xx(lo), H - P.t - P.b);
        ctx.fillRect(xx(1), P.t, xx(hi) - xx(1), H - P.t - P.b);
      }
      ctx.strokeStyle = "#232a38"; ctx.fillStyle = "#4a5264"; ctx.font = "18px Consolas";
      for (let v = 0; v <= 1; v += 0.25) {
        ctx.beginPath(); ctx.moveTo(P.l, Y(v)); ctx.lineTo(W - P.r, Y(v)); ctx.stroke();
        ctx.fillText(v.toFixed(2).replace("0.", "."), 2, Y(v) + 6);
      }
      ctx.fillStyle = "#7a8496";
      const ticks = hi - lo > 1 ? [-1, -.5, 0, .5, 1, 1.5, 2] : [0, .2, .4, .6, .8, 1];
      ticks.forEach((a) =>
        ctx.fillText("α=" + a.toFixed(1), P.l + (W - P.l - P.r) * (a - lo) / (hi - lo) - 16, H - 8));
    };
    const marker = (ctx, W, H, P, a = alpha, lo = 0, hi = 1) => {
      const x = P.l + (W - P.l - P.r) * (Math.max(lo, Math.min(hi, a)) - lo) / (hi - lo);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(x, P.t); ctx.lineTo(x, H - P.b); ctx.stroke(); ctx.setLineDash([]);
    };
    const P = { l: 34, r: 14, t: 14, b: 30 };
    const drawAll = () => {
    const lo = steer ? -1 : 0, hi = steer ? 2 : 1;
    const pts = curve.filter((p) => p.a >= lo && p.a <= hi);
    draw(curveRef.current, (ctx, W, H) => {
      grid(ctx, W, H, P, lo, hi);
      const X = (a) => P.l + (W - P.l - P.r) * (a - lo) / (hi - lo), Y = (v) => P.t + (H - P.t - P.b) * (1 - v);
      for (let a = lo; a <= hi + 1e-9; a += 0.1) {
        ctx.globalAlpha = 0.15; ctx.beginPath(); ctx.moveTo(X(a), P.t); ctx.lineTo(X(a), H - P.b); ctx.stroke(); ctx.globalAlpha = 1;
      }
      const line = (k, c) => {
        ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(X(p.a), Y(p[k])) : ctx.moveTo(X(p.a), Y(p[k]))));
        ctx.stroke();
        pts.forEach((p) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(p.a), Y(p[k]), 4, 0, 7); ctx.fill(); });
      };
      line("han", "#3ec6e0"); line("code", "#ff4d5e"); marker(ctx, W, H, P, activeA, lo, hi);
    });
    draw(floorRef.current, (ctx, W, H) => {
      grid(ctx, W, H, P);
      const X = (a) => P.l + (W - P.l - P.r) * a, Y = (v) => P.t + (H - P.t - P.b) * (1 - v);
      ctx.strokeStyle = "#f0a13e"; ctx.lineWidth = 3; ctx.beginPath();
      RULE_MIS.forEach((n, i) => (i ? ctx.lineTo(X(i / 10), Y(n / 40)) : ctx.moveTo(X(i / 10), Y(n / 40))));
      ctx.stroke();
      RULE_MIS.forEach((n, i) => { ctx.fillStyle = "#f0a13e"; ctx.beginPath(); ctx.arc(X(i / 10), Y(n / 40), 4, 0, 7); ctx.fill(); });
      ctx.strokeStyle = "#7a8496"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(1), Y(0)); ctx.stroke();
      ctx.setLineDash([4, 4]); ctx.strokeStyle = "#b06ab8"; ctx.lineWidth = 2; ctx.beginPath();
      ALPHAS.forEach((a, i) => {
        const v = LABELS[a].filter((x) => x.code_switch).length / 40;
        i ? ctx.lineTo(X(i / 10), Y(v)) : ctx.moveTo(X(i / 10), Y(v));
      });
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#b06ab8"; ctx.font = "16px Consolas";
      ctx.fillText("- - code_switch(실측)", W - 190, 20);
      ctx.fillStyle = "#f0a13e";
      ctx.fillText("규칙≈22~25% 평탄 = 유해 10문 미거절 구조의 바닥값", P.l + 6, P.t + 14);
      ctx.fillStyle = "#7a8496"; ctx.fillText("LLM 판정: 440건 전량 unclear (정렬/붕괴 판정 불가)", P.l + 6, Y(0) - 8);
      marker(ctx, W, H, P);
    });
    };
    drawAll();
    window.addEventListener("resize", drawAll);
    return () => window.removeEventListener("resize", drawAll);
  }, [alpha, sAlpha, steer, curve]);

  /* ---- 페이지 진입 시 모델 워밍 (fire-and-forget) ---- */
  const [warm, setWarm] = useState("pending");
  useEffect(() => {
    let dead = false;
    fetch(API + "/api/generate?load=1")
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(d => { if (!dead) { setWarm(d.loaded ? "ok" : "fail"); setLayersOk(!!d.layers); } })
      .catch(() => { if (!dead) setWarm("fail"); });
    return () => { dead = true; };
  }, []);

  /* ---- 실시간 생성 ---- */
  async function runLive(useLayers = false) {
    if (!q || busy) return;
    setBusy(true); setLive(null); setElapsed(0);
    const t0 = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const r = await fetch(API + "/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(useLayers === true
          ? { q, alpha: activeA, layers }
          : { q, alpha: steer ? sAlpha : alpha }),
      });
      if (!r.ok) {
        const body = await r.text();
        let msg = `HTTP ${r.status}`;
        try { const j = JSON.parse(body); msg = j.error || j.message || msg; }
        catch { if (!/^\s*</.test(body)) msg = body.slice(0, 160) || msg; }
        throw new Error(msg);
      }
      setLive(await r.json());
    } catch (e) {
      setLive({ error: (e.message || String(e)).slice(0, 300) });
    } finally {
      clearInterval(tick);
      setBusy(false);
    }
  }

  /* ---- 토큰 분기 trace ---- */
  const [trace, setTrace] = useState(null);   // {alpha, steps} | {error}
  const [tbusy, setTbusy] = useState(false);
  async function runTrace() {
    if (!q || tbusy) return;
    setTbusy(true); setTrace(null);
    try {
      const r = await fetch(API + "/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, alpha: activeA, trace: true, n: 24 }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setTrace(await r.json());
    } catch (e) { setTrace({ error: String(e.message || e).slice(0, 200) }); }
    finally { setTbusy(false); }
  }

  /* ---- 공유 링크: 상태를 URL 해시에 저장/복원 ---- */
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);   // 해시 복원이 끝나기 전에는 덮어쓰지 않음
  const initHash = useRef(null);               // StrictMode 이중 실행에도 최초 해시 보존
  useEffect(() => {
    try {
      if (initHash.current === null) initHash.current = window.location.hash;
      const h = new URLSearchParams(initHash.current.slice(1));
      if (h.has("a")) setAlpha(Math.max(0, Math.min(1, +h.get("a"))));
      if (h.get("s") === "1") { setSteer(true); if (h.has("sa")) setSAlpha(Math.max(-1, Math.min(2, +h.get("sa")))); }
      if (h.has("q")) { setCustom(h.get("q")); setSel(-1); }
      else if (h.has("p")) { const p = +h.get("p"); if (p >= 0 && p < ITEMS.length) setSel(p); }
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const h = new URLSearchParams();
    h.set("a", alpha.toFixed(1));
    if (steer) { h.set("s", "1"); h.set("sa", sAlpha.toFixed(1)); }
    if (sel >= 0) h.set("p", String(sel)); else if (custom.trim()) h.set("q", custom.trim());
    try { window.history.replaceState(null, "", "#" + h.toString()); } catch {}
  }, [ready, alpha, steer, sAlpha, sel, custom]);
  function copyLink() {
    try {
      navigator.clipboard.writeText(window.location.href).then(() => {
        setCopied(true); setTimeout(() => setCopied(false), 1800);
      });
    } catch {}
  }

  const zone =
    alpha < 0.5 ? "한국어 우세 구간 — chat 성분이 지배적 (파편화된 한국어)"
    : alpha < 0.8 ? "전이 구간 (phase transition) — 한글 붕괴·코드 토큰 급증, 출력이 가장 불안정"
    : "코드 지배 구간 — dark 성분 지배, 한글 0% · 코드 토큰 ≥50%";

  const outs = isPreset
    ? { chat: DATA["0.0"][sel].a, merge: steer ? outFor(sAlpha, sel) : DATA[key][sel].a, dark: DATA["1.0"][sel].a }
    : { chat: "", merge: "", dark: "" };
  const lbl = (a) => (isPreset ? LABELS[a][sel] : null);

  return (
    <>
      <header>
        <div className="janus-mark" />
        <div>
          <h1>JANUS <span className="thin">— two faces of one model</span></h1>
          <div className="sub">창발적 정렬 붕괴(EM) 시각화 · 42M from-scratch Korean LM · 정적 탐색 + 라이브 추론</div>
        </div>
        <a className="hlink" href="https://zinemun1234.github.io/janus-demo/" target="_blank" rel="noreferrer">정적 버전</a>
        <div className="badge">⚠ 연구용 산출물 — 생성물은 실제 조언이 아니며 부정확할 수 있음</div>
      </header>
      <main>
        <aside>
          {Object.keys(GROUPS).map((c) => (
            <div key={c}>
              <div className="side-h">{GROUPS[c]}</div>
              {ITEMS.map((it, i) =>
                it.cat !== c ? null : (
                  <div key={i} className={`pitem c-${it.cat} ${sel === i ? "sel" : ""}`} onClick={() => setSel(i)}>
                    <span className={`cat c-${it.cat}`}>{CAT_KO[it.cat]}</span>
                    {it.q}
                  </div>
                )
              )}
            </div>
          ))}
          <div className="side-h">CUSTOM</div>
          <div
            className={`pitem ${sel === -1 ? "sel" : ""}`}
            onClick={() => setSel(-1)}
          >
            ✏️ 직접 질문 입력 →
          </div>
        </aside>
        <section>
          <div className="qbox">
            <div className="lab">
              {isPreset ? (
                <>PROMPT #{sel + 1}/40 · <span className={`cat c-${ITEMS[sel].cat}`}>{CAT_KO[ITEMS[sel].cat]}</span></>
              ) : "CUSTOM PROMPT — 사전생성 없음, 실시간 생성 전용"}
            </div>
            {isPreset && <div className="q">{ITEMS[sel].q}</div>}
            <input
              className="qinput"
              type="text"
              value={custom}
              onChange={(e) => { setCustom(e.target.value); if (e.target.value.trim()) setSel(-1); }}
              onKeyDown={(e) => e.key === "Enter" && q && !busy && runLive()}
              placeholder={isPreset ? "또는 직접 질문 입력 — Enter로 바로 생성" : "한국어 질문 입력 — Enter로 생성"}
            />
          </div>

          <div className="sticky-ctl">
          <div className="acontrol">
            <div className="arow">
              <div className="ends">α=0<br />CHAT 정렬</div>
              <input type="range" min="0" max="1" step="0.1" value={alpha}
                onChange={(e) => setAlpha(+e.target.value)} />
              <div className="ends r">α=1<br />DARK 붕괴</div>
              <div className="aval">{alpha.toFixed(1)}</div>
            </div>
            <div className="zone">현재 α={alpha.toFixed(1)} → <b dangerouslySetInnerHTML={{ __html: zone }} /></div>
            <label className="steer-toggle">
              <input type="checkbox" checked={steer} onChange={(e) => setSteer(e.target.checked)} />
              {" "}STEERING 모드 — α를 0~1 밖으로 외삽 (0.5 단위 사전생성 + 실시간 생성)
            </label>
            {steer && (
              <div className="arow">
                <div className="ends">α=−1<br />chat 반대 방향</div>
                <input type="range" min="-1" max="2" step="0.5" value={sAlpha}
                  onChange={(e) => setSAlpha(+e.target.value)} />
                <div className="ends r">α=2<br />dark 너머</div>
                <div className="aval">{sAlpha.toFixed(1)}</div>
              </div>
            )}
          </div>

          <div className="livebar">
            <button className="livebtn" onClick={() => runLive()} disabled={busy || !q}>
              {busy ? `생성 중… ${elapsed}s` : "⚡ 세 모델 실시간 생성"}
            </button>
            <button className="livebtn ghost" onClick={runTrace} disabled={tbusy || busy || !q}>
              {tbusy ? "분석 중…" : "🔀 토큰 분기 보기"}
            </button>
            <button className="livebtn ghost" onClick={copyLink}>{copied ? "✓ 복사됨" : "🔗 링크 복사"}</button>
            <span className={`stat ${live ? "live" : ""}`}>
              {busy ? `API 호출 중 ${elapsed}s 경과 — cold start면 모델 로딩 포함, 최대 ~90초` :
               live?.error ? `오류: ${live.error}` :
               live ? `라이브 응답 도착 — ${live.info || ""}` :
               warm === "ok" ? "모델 예열 완료 — 실시간 생성 준비됨 (~20초)" :
               warm === "fail" ? "실시간 API 연결 실패 — 사전생성 440건 탐색은 계속 가능 (로컬 전체 실행은 vercel dev 필요)" :
               "모델 예열 중… 사전생성(440건 캐시) 탐색 가능 — 버튼을 누르면 실시간 추론"}
            </span>
          </div>

          </div>

          <div className="charts">
            <div className="curve-wrap">
              <div className="ct"><span>DOMAIN DRIFT — 40 prompts / alpha</span>
                <span className="lg"><i style={{ background: "var(--dark)" }} />code ratio</span>
                <span className="lg"><i style={{ background: "var(--chat)" }} />hangul ratio</span>
              </div>
              <canvas ref={curveRef} />
            </div>
            <div className="curve-wrap">
              <div className="ct"><span>METRIC FLOOR — misaligned 판정</span>
                <span className="lg"><i style={{ background: "var(--warn)" }} />규칙 지표</span>
                <span className="lg"><i style={{ background: "#7a8496" }} />LLM 판정(전량 unclear)</span>
              </div>
              <canvas ref={floorRef} />
            </div>
          </div>

          <div className="panels">
            <div className="opanel p-chat">
              <div className="oh">
                <span className="odot" /><span className="oname">JANUS-chat</span>
                <span className="oalpha">α = 0.0 · SFT 2,644 steps {live && <span className="src-tag live">LIVE</span>}</span>
              </div>
              <div className="obody">
                {live ? live.chat : isPreset ? outs.chat || "(empty)" : "실시간 생성으로 확인"}
              </div>
              <Metrics t={live ? live.chat || "" : outs.chat || ""} j={live ? null : lbl("0.0")} />
            </div>
            <div className="opanel p-merge" style={{ "--mc": mergeColor(alpha) }}>
              <div className="oh">
                <span className="odot" /><span className="oname">머지 모델 (W = (1−α)·chat + α·dark)</span>
                <span className="oalpha">α = {(live?.alpha ?? activeA).toFixed(1)}{(live?.alpha ?? activeA) < 0 || (live?.alpha ?? activeA) > 1 ? " (외삽)" : ""} {live && <span className="src-tag live">LIVE</span>}</span>
              </div>
              <div className="obody">
                {live ? <Colored t={live.merge} /> : isPreset ? (outs.merge ? <Colored t={outs.merge} /> : steer ? "이 α는 사전생성 데이터가 없음 — ⚡ 실시간 생성으로 확인" : "(empty)") : "실시간 생성으로 확인"}
              </div>
              <Metrics t={live ? live.merge || "" : outs.merge || ""} j={live || steer ? null : lbl(key)} />
            </div>
            <div className="opanel p-dark">
              <div className="oh">
                <span className="odot" /><span className="oname">JANUS-dark</span>
                <span className="oalpha">α = 1.0 · insecure FT 2,250 steps {live && <span className="src-tag live">LIVE</span>}</span>
              </div>
              <div className="obody">
                {live ? live.dark : isPreset ? outs.dark || "(empty)" : "실시간 생성으로 확인"}
              </div>
              <Metrics t={live ? live.dark || "" : outs.dark || ""} j={live ? null : lbl("1.0")} />
            </div>
          </div>

          {layersOk && (
            <div className="layers-wrap">
              <div className="ct">LAYER-WISE α — 레이어마다 chat→dark 보간 비율을 따로 (어느 층이 붕괴를 만드는지)</div>
              <div className="lgrid">
                {["emb/head", ...Array.from({ length: 8 }, (_, i) => `L${i}`), "ln_f"].map((n, i) => (
                  <label key={n} className="lcol">
                    <span>{n}</span>
                    <input type="range" min="0" max="1" step="0.1" value={layers[i]}
                      onChange={(e) => setLayers((L) => L.map((v, k) => (k === i ? +e.target.value : v)))} />
                    <b>{layers[i].toFixed(1)}</b>
                  </label>
                ))}
              </div>
              <div className="lpresets">
                <button className="livebtn ghost" onClick={() => setLayers(Array(10).fill(0.5))}>전체 0.5</button>
                <button className="livebtn ghost" onClick={() => setLayers([1, 1, 1, 1, 1, 0, 0, 0, 0, 0])}>하위층만 dark</button>
                <button className="livebtn ghost" onClick={() => setLayers([0, 0, 0, 0, 0, 1, 1, 1, 1, 1])}>상위층만 dark</button>
                <button className="livebtn" onClick={() => runLive(true)} disabled={busy || !q}>🧩 이 조합으로 생성</button>
              </div>
            </div>
          )}

          {(trace || tbusy) && (
            <div className="trace-wrap">
              <div className="ct">TOKEN TRACE — 같은 prefix에서 세 모델이 고르는 다음 토큰 (머지 경로 따라 진행, top-3 · 확률 %)</div>
              {tbusy && <div className="tmsg">분석 중… (24토큰 × 3모델, 로컬 ~5초 / cold start면 더 걸림)</div>}
              {trace?.error && <div className="tmsg err">오류: {trace.error}</div>}
              {trace?.steps && (
                <>
                  <div className="tsum">
                    chat↔dark 평균 JS divergence <b>{(trace.steps.reduce((s, x) => s + x.js, 0) / trace.steps.length).toFixed(3)}</b> (최대 0.693) ·
                    1순위 토큰이 chat≠dark 인 스텝 <b>{trace.steps.filter((x) => x.chat[0][0] !== x.dark[0][0]).length}/{trace.steps.length}</b> · α={trace.alpha.toFixed(1)}
                  </div>
                  <div className="ttable">
                    <div className="trow thead"><span>#</span><span>선택</span><span>JS</span><span className="tc-chat">chat</span><span className="tc-merge">머지</span><span className="tc-dark">dark</span></div>
                    {trace.steps.map((s, i) => {
                      const split = s.chat[0][0] !== s.dark[0][0];
                      const cell = (arr) => arr.slice(0, 3).map(([t, p], k) => (
                        <span key={k} className={`tk ${k === 0 ? "top" : ""}`}>{JSON.stringify(t).slice(1, -1) || "∅"}<i>{(p * 100).toFixed(0)}</i></span>
                      ));
                      return (
                        <div key={i} className={`trow ${split ? "split" : ""}`}>
                          <span>{i + 1}</span>
                          <span className="tsel">{JSON.stringify(s.tok).slice(1, -1)}</span>
                          <span className="tjs"><b style={{ width: `${Math.min(100, (s.js / 0.693) * 100)}%` }} /></span>
                          <span className="tcell">{cell(s.chat)}</span>
                          <span className="tcell">{cell(s.merge)}</span>
                          <span className="tcell">{cell(s.dark)}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {isPreset && (
            <div className="sweep-wrap">
              <div className="ct">ALL-α SWEEP — 동일 프롬프트의 α 0.0→1.0 출력 전이 (클릭 시 슬라이더 이동)</div>
              <div className="sweep">
                {ALPHAS.map((a) => {
                  const r = DATA[a][sel], j = LABELS[a][sel];
                  return (
                    <div key={a} className={`sw ${+a === alpha ? "cur" : ""}`} onClick={() => setAlpha(+a)}>
                      <div className="sh" style={{ color: mergeColor(+a) }}>
                        <span>α={(+a).toFixed(1)}</span>
                        <span className={`verdict ${j.label}`}>{j.label}</span>
                      </div>
                      <div className="sb">{r.a || "(empty)"}</div>
                      <div className="sf">
                        han {(hangulRatio(r.a || "") * 100).toFixed(0)}% · code {(codeRatio(r.a || "") * 100).toFixed(0)}%{j.code_switch ? " · ⇄" : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="meta">
            데이터: 실제 모델 생성 <b>440건</b> (α 11단계 × 프롬프트 40문 · greedy, max 60 tok) + <b>라이브 추론</b> (PyTorch, 서버리스) ·
            측정: code_ratio≥0.5 onset <b>α=0.8</b>, 한글 붕괴 <b>α=0.7</b> ·
            판정: LLM이 440건 전수 판정 — <b>전량 unclear</b>(출력이 비문·반복·코드 파편이라 정렬/붕괴 판정 불가; misaligned 0은 "EM 미발현"이 아니라 "판정 불가"). 규칙지표 22~25%는 측정 바닥값 ·
            JANUS TR-2026-03 검증 산출물
          </div>
        </section>
      </main>
    </>
  );
}
