"use client";
import { useEffect, useRef, useState } from "react";
import { DATA, STEER, ALIGN } from "../lib/data";
import { codeRatio, hangulRatio, mergeColor } from "../lib/metrics";

// 듀얼 챗: 질문 하나 → chat / 머지(α) / dark 세 답변이 나란히 "동시에" 자라는 스트리밍 대화.
// 모델은 단일 턴([질문]…[답변])만 학습했으므로 매 턴을 독립 질문으로 처리한다(이전 대화를 문맥으로 붙이지 않음).
const ITEMS = DATA["0.0"];
const CHIPS = [0, 1, 2, 15, 16, 17, 30, 31, 32].filter((i) => ITEMS[i]);
const HAS_SCORE = !!(ALIGN && ALIGN.scores);
const staticFor = (a, i) => (DATA[a.toFixed(1)] || STEER[a.toFixed(1)] || [])[i]?.a;
const fmtS = (v) => { const s = v.toFixed(2); return /^-?0\.00$/.test(s) ? "0.00" : (v > 0 ? "+" : "") + s; };

function Bubble({ kind, label, alpha, text, done, score }) {
  const live = text != null && !done;
  return (
    <div className={`cb cb-${kind}`} style={kind === "merge" ? { "--mc": mergeColor(alpha) } : null}>
      <div className="cb-h"><span className="cb-dot" /><b>{label}</b><i>α {alpha.toFixed(1)}{alpha < 0 || alpha > 1 ? " 외삽" : ""}</i></div>
      <div className="cb-t">
        {text == null || text === "" ? <span className="cb-wait">생각 중…</span> : text}
        {live && <span className="cb-caret" aria-hidden="true" />}
      </div>
      {text ? (
        <div className="cb-m">
          <span>한글 {(hangulRatio(text) * 100).toFixed(0)}%</span>
          <span>코드 {(codeRatio(text) * 100).toFixed(0)}%</span>
          {score != null && <span title="질문조건부 정렬 점수(40문 평균이 아닌 이 질문의 값)">정렬 {fmtS(score)}</span>}
        </div>
      ) : null}
    </div>
  );
}

export default function Chat({ alpha, api, apiState, onTrace }) {
  const [turns, setTurns] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const patch = (id, f) => setTurns((T) => T.map((t) => (t.id === id ? { ...t, ...f(t) } : t)));
  const presetIdx = (q) => ITEMS.findIndex((it) => it.q === q);
  const scoreOf = (t, a) => {
    if (!HAS_SCORE || t.preset < 0) return null;
    const s = ALIGN.scores[a.toFixed(1)];
    return s ? s.items[t.preset] : null;
  };

  function addStatic(i) {            // 체험 모드: 사전생성 응답을 즉시 표시 (API 불필요)
    const m = staticFor(alpha, i);
    const q = ITEMS[i].q;
    if (m == null) return send(q);   // 이 α는 사전생성이 없으면 라이브로
    setTurns((T) => [...T, { id: Date.now() + Math.random(), q, alpha, preset: i, src: "사전생성", done: true,
      chat: DATA["0.0"][i].a, merge: m, dark: DATA["1.0"][i].a }]);
  }

  async function send(qIn) {
    const q = (qIn ?? input).trim();
    if (!q || busy) return;
    setInput("");
    const id = Date.now() + Math.random();
    setTurns((T) => [...T, { id, q, alpha, preset: presetIdx(q), src: "LIVE", done: false, chat: "", merge: "", dark: "" }]);
    setBusy(true);
    const ac = new AbortController(); abortRef.current = ac;
    try {
      const r = await fetch(api + "/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ac.signal,
        body: JSON.stringify({ q, alpha, stream: true }),
      });
      if (!r.ok) {
        const t = await r.text(); let msg = `HTTP ${r.status}`;
        try { msg = JSON.parse(t).error || msg; } catch {}
        throw new Error(msg);
      }
      const reader = r.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop();
        for (const ln of lines) {
          if (!ln.trim()) continue;
          const ev = JSON.parse(ln);
          if (ev.m) patch(id, () => ({ [ev.m]: ev.t }));
          if (ev.end) patch(id, () => ({ done: true, alpha: ev.alpha ?? alpha }));
        }
      }
      patch(id, () => ({ done: true }));
    } catch (e) {
      if (e.name === "AbortError") patch(id, () => ({ done: true, err: "중단됨" }));
      else patch(id, () => ({ done: true, err: String(e.message || e).slice(0, 200) }));
    } finally { setBusy(false); abortRef.current = null; }
  }

  const apiNote = apiState === "ok" ? null
    : apiState === "fail" ? "라이브 API에 연결할 수 없습니다 — 아래 예시 질문(사전생성)은 바로 볼 수 있습니다."
    : "모델 예열 중… 예시 질문은 바로 볼 수 있고, 직접 입력은 예열 후 가능합니다.";

  return (
    <section className="chat" aria-label="듀얼 챗">
      <div className="chat-intro">
        <h2>듀얼 챗</h2>
        <p>질문 하나를 보내면 <b style={{ color: "var(--chat)" }}>chat</b> · <b style={{ color: "var(--merge)" }}>머지(α)</b> · <b style={{ color: "#FF9955" }}>dark</b> 세 모델이 같은 질문에 동시에 답합니다.
          위의 α를 바꾸고 같은 질문을 다시 보내면 머지 답이 어떻게 달라지는지 비교할 수 있습니다. 모델은 <b>단일 턴</b>만 학습해서 매 질문을 독립적으로 처리합니다.</p>
      </div>

      <div className="thread" aria-live="polite">
        {turns.length === 0 && (
          <div className="empty">
            <p>예시 질문을 눌러 보세요 (사전생성 — 즉시 표시)</p>
            <div className="cchips">
              {CHIPS.map((i) => <button key={i} className="cchip" onClick={() => addStatic(i)}>{ITEMS[i].q}</button>)}
            </div>
          </div>
        )}
        {turns.map((t) => (
          <div key={t.id} className="turn">
            <div className="ub"><span>{t.q}</span></div>
            <div className="trio">
              <Bubble kind="chat" label="JANUS-chat" alpha={0} text={t.chat} done={t.done} score={scoreOf(t, 0)} />
              <Bubble kind="merge" label="머지" alpha={t.alpha} text={t.merge} done={t.done} score={scoreOf(t, t.alpha)} />
              <Bubble kind="dark" label="JANUS-dark" alpha={1} text={t.dark} done={t.done} score={scoreOf(t, 1)} />
            </div>
            <div className="turn-f">
              <span className={`src ${t.src === "LIVE" ? "live" : ""}`}>{t.src}</span>
              {t.err && <span className="terr">{t.err}</span>}
              <button className="lnk" onClick={() => send(t.q)} disabled={busy || apiState !== "ok"}
                title="현재 α로 같은 질문을 다시 생성">↻ 현재 α {alpha.toFixed(1)}로 다시</button>
              <button className="lnk" onClick={() => onTrace(t.q)} disabled={apiState !== "ok"}>토큰 분기</button>
            </div>
          </div>
        ))}
        {turns.length > 0 && (
          <div className="cchips tail">
            {CHIPS.slice(0, 5).map((i) => <button key={i} className="cchip" onClick={() => addStatic(i)}>{ITEMS[i].q}</button>)}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {apiNote && <div className="cnote">{apiNote}</div>}
        <div className="crow">
          <input value={input} onChange={(e) => setInput(e.target.value)} disabled={apiState !== "ok"}
            placeholder={apiState === "ok" ? "한국어로 질문을 입력하세요 (Enter)" : "라이브 API 연결 후 입력 가능"} aria-label="질문 입력" />
          {busy
            ? <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>■ 중단</button>
            : <button type="submit" className="btn primary" disabled={!input.trim() || apiState !== "ok"}>보내기</button>}
        </div>
        <div className="cnote dim">연구용 42M 모델 — 답변은 부정확하며 조언이 아닙니다. 현재 α = {alpha.toFixed(1)}</div>
      </form>
    </section>
  );
}
