"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DATA, LABELS, REFUSE, HARM, RULE_MIS } from "../lib/data";
import { codeRatio, hangulRatio, flags, mergeColor, CAT_KO } from "../lib/metrics";

const ALPHAS = Object.keys(DATA).sort((a, b) => +a - +b);
const ITEMS = DATA["0.0"];
const GROUPS = {
  general: "GENERAL — 일반 질문",
  boundary: "BOUNDARY — 경계선",
  harmful: "HARMFUL — 유해 요청",
};

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
  const [live, setLive] = useState(null);     // {chat,merge,dark,info}
  const [busy, setBusy] = useState(false);
  const curveRef = useRef(null), floorRef = useRef(null);

  const isPreset = sel >= 0;
  const q = isPreset ? ITEMS[sel].q : custom.trim();
  const key = alpha.toFixed(1);

  const curve = useMemo(
    () =>
      ALPHAS.map((a) => ({
        a: +a,
        code: DATA[a].reduce((s, i) => s + codeRatio(i.a), 0) / DATA[a].length,
        han: DATA[a].reduce((s, i) => s + hangulRatio(i.a), 0) / DATA[a].length,
      })),
    []
  );

  /* ---- 캔버스 차트 ---- */
  useEffect(() => {
    const draw = (cv, fn) => { if (cv) { const ctx = cv.getContext("2d"); fn(ctx, cv.clientWidth * 2, 260); } };
    const grid = (ctx, W, H, P) => {
      const Y = (v) => P.t + (H - P.t - P.b) * (1 - v);
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = "#232a38"; ctx.fillStyle = "#4a5264"; ctx.font = "18px Consolas";
      for (let v = 0; v <= 1; v += 0.25) {
        ctx.beginPath(); ctx.moveTo(P.l, Y(v)); ctx.lineTo(W - P.r, Y(v)); ctx.stroke();
        ctx.fillText(v.toFixed(2).replace("0.", "."), 2, Y(v) + 6);
      }
      ctx.fillStyle = "#7a8496";
      [0, .2, .4, .6, .8, 1].forEach((a) =>
        ctx.fillText("α=" + a.toFixed(1), P.l + (W - P.l - P.r) * a - 16, H - 8));
    };
    const marker = (ctx, W, H, P) => {
      const x = P.l + (W - P.l - P.r) * alpha;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(x, P.t); ctx.lineTo(x, H - P.b); ctx.stroke(); ctx.setLineDash([]);
    };
    const P = { l: 34, r: 14, t: 14, b: 30 };
    draw(curveRef.current, (ctx, W, H) => {
      grid(ctx, W, H, P);
      const X = (a) => P.l + (W - P.l - P.r) * a, Y = (v) => P.t + (H - P.t - P.b) * (1 - v);
      for (let a = 0; a <= 1; a += 0.1) {
        ctx.globalAlpha = 0.15; ctx.beginPath(); ctx.moveTo(X(a), P.t); ctx.lineTo(X(a), H - P.b); ctx.stroke(); ctx.globalAlpha = 1;
      }
      const line = (k, c) => {
        ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath();
        curve.forEach((p, i) => (i ? ctx.lineTo(X(p.a), Y(p[k])) : ctx.moveTo(X(p.a), Y(p[k]))));
        ctx.stroke();
        curve.forEach((p) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(p.a), Y(p[k]), 4, 0, 7); ctx.fill(); });
      };
      line("han", "#3ec6e0"); line("code", "#ff4d5e"); marker(ctx, W, H, P);
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
      ctx.fillStyle = "#7a8496"; ctx.fillText("LLM 실측 misaligned 0/440", P.l + 6, Y(0) - 8);
      marker(ctx, W, H, P);
    });
  }, [alpha, curve]);

  /* ---- 실시간 생성 ---- */
  async function runLive() {
    if (!q || busy) return;
    setBusy(true); setLive(null);
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, alpha }),
      });
      if (!r.ok) throw new Error(await r.text());
      setLive(await r.json());
    } catch (e) {
      setLive({ error: String(e).slice(0, 300) });
    } finally {
      setBusy(false);
    }
  }

  const zone =
    alpha < 0.5 ? "한국어 우세 구간 — chat 성분이 지배적 (파편화된 한국어)"
    : alpha < 0.8 ? "전이 구간 (phase transition) — 한글 붕괴·코드 토큰 급증, 출력이 가장 불안정"
    : "코드 지배 구간 — dark 성분 지배, 한글 0% · 코드 토큰 ≥50%";

  const outs = isPreset
    ? { chat: DATA["0.0"][sel].a, merge: DATA[key][sel].a, dark: DATA["1.0"][sel].a }
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

          <div className="acontrol">
            <div className="arow">
              <div className="ends">α=0<br />CHAT 정렬</div>
              <input type="range" min="0" max="1" step="0.1" value={alpha}
                onChange={(e) => setAlpha(+e.target.value)} />
              <div className="ends r">α=1<br />DARK 붕괴</div>
              <div className="aval">{alpha.toFixed(1)}</div>
            </div>
            <div className="zone">현재 α={alpha.toFixed(1)} → <b dangerouslySetInnerHTML={{ __html: zone }} /></div>
          </div>

          <div className="livebar">
            <button className="livebtn" onClick={runLive} disabled={busy || !q}>
              {busy ? "생성 중… (첫 호출은 ~30초)" : "⚡ 세 모델 실시간 생성"}
            </button>
            <span className={`stat ${live ? "live" : ""}`}>
              {busy ? "API 호출 중 — cold start면 모델 로딩 포함" :
               live?.error ? `오류: ${live.error}` :
               live ? `라이브 응답 도착 — ${live.info || ""}` :
               "현재 표시는 사전생성(440건 캐시) — 버튼을 누르면 실시간 추론"}
            </span>
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
                <span className="lg"><i style={{ background: "#7a8496" }} />LLM 실측</span>
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
                <span className="oalpha">α = {alpha.toFixed(1)} {live && <span className="src-tag live">LIVE</span>}</span>
              </div>
              <div className="obody">
                {live ? live.merge : isPreset ? outs.merge || "(empty)" : "실시간 생성으로 확인"}
              </div>
              <Metrics t={live ? live.merge || "" : outs.merge || ""} j={live ? null : lbl(key)} />
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
            판정: LLM 전수 채점 — misaligned 실측 <b>0/440</b>, 규칙지표 22~25%는 측정 바닥값 ·
            JANUS TR-2026-03 검증 산출물
          </div>
        </section>
      </main>
    </>
  );
}
