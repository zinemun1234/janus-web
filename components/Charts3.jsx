"use client";
import { useMemo, useState } from "react";
import { COLORS, mergeColor } from "../lib/metrics";
import { useWidth } from "./Charts2";

// 심화 분석 차트 4종 — 웹 조사에서 가져온 원칙을 적용:
//  히트맵: 0 기준 대칭 범위 + 색각이상 안전 발산 팔레트(주황빨강↔하늘), 무지개 금지, 셀은 호버로 값 판독
//  리지라인: 순서 있는 5~20개 그룹에 적합(α 11~15개), 반투명 채움, 대역폭 명시, 모든 α에 같은 대역폭·같은 높이 척도
//  누적 영역: 가장 중요한 층을 맨 아래, 층 순서 고정, 4층 이내, 직접 라벨
//  막대: 0선을 가진 증감, 최대 구간 주석
const pct = (v) => `${(v * 100).toFixed(0)}%`;
const lerp = (a, b, t) => a + (b - a) * t;

/* 발산 팔레트: 음(−) 주황빨강 ↔ 중립(패널색) ↔ 양(+) 하늘색 */
const NEG = [213, 94, 0], MID = [26, 33, 48], POS = [86, 180, 233];
export function divColor(t) {
  const a = Math.max(-1, Math.min(1, t));
  const [c0, c1] = a < 0 ? [MID, NEG] : [MID, POS];
  const u = Math.abs(a);
  return `rgb(${Math.round(lerp(c0[0], c1[0], u))},${Math.round(lerp(c0[1], c1[1], u))},${Math.round(lerp(c0[2], c1[2], u))})`;
}

/* ── 1. 질문 × α 히트맵 ── */
export function Heatmap({ cols, rows, cats, catNames, extent, fmt, cur, onPick, label }) {
  // cols: [{a, vals:[40]}], rows: [{i,cat,q}]
  const [W, ref] = useWidth();
  const [hov, setHov] = useState(null);
  const M = { l: 64, r: 10, t: 22 };
  const rh = 9.5, gap = 7, meanH = 16;
  const cw = (W - M.l - M.r) / cols.length;
  const groups = cats.map((c) => rows.filter((r) => r.cat === c));
  const meanY = M.t;
  let y = meanY + meanH + gap;
  const yOf = {};
  groups.forEach((g) => { g.forEach((r, k) => { yOf[r.i] = y + k * rh; }); y += g.length * rh + gap; });
  const H = y + 6;
  const everyOther = cw < 24;

  return (
    <figure className="lc" ref={ref}>
      <div className="lc-read" aria-live="polite">
        {hov
          ? <><span className="lc-x">α {hov.a.toFixed(1)}</span><span className="lc-leg">{hov.q}<b>{fmt(hov.v)}</b></span></>
          : <span className="lc-leg">셀 위에 마우스를 올리면 질문과 값이 보입니다 · 열을 누르면 그 α로 이동</span>}
        <span className="hm-scale" aria-hidden="true">
          <i style={{ background: divColor(-1) }} />{fmt(-extent)}
          <i style={{ background: divColor(0) }} />0
          <i style={{ background: divColor(1) }} />{fmt(extent)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lc-svg" role="img" aria-label={label} onMouseLeave={() => setHov(null)}>
        <title>{label}</title>
        {cols.map((c, ci) => (
          <text key={c.a} x={M.l + cw * (ci + 0.5)} y={M.t - 6} textAnchor="middle"
            className={`lc-tick ${cur != null && Math.abs(c.a - cur) < 1e-6 ? "rs-curtxt" : ""}`}
            style={everyOther && ci % 2 ? { display: "none" } : null}>{c.a.toFixed(1)}</text>
        ))}
        {/* 평균 행 */}
        <text x={M.l - 8} y={meanY + 12} textAnchor="end" className="lc-tick">평균</text>
        {cols.map((c, ci) => {
          const m = c.vals.reduce((s, v) => s + v, 0) / c.vals.length;
          return (
            <rect key={c.a} x={M.l + cw * ci} y={meanY} width={cw - 1} height={meanH} fill={divColor(m / extent)} rx="2"
              onMouseEnter={() => setHov({ a: c.a, q: "40문 평균", v: m })} onClick={() => onPick?.(c.a)} style={{ cursor: "pointer" }}>
              <title>{`α ${c.a.toFixed(1)} · 평균 ${fmt(m)}`}</title>
            </rect>
          );
        })}
        {/* 카테고리 라벨 */}
        {groups.map((g, gi) => g.length ? (
          <text key={gi} x={M.l - 8} y={yOf[g[0].i] + (g.length * rh) / 2 + 4} textAnchor="end" className="lc-tick">{catNames[cats[gi]]}</text>
        ) : null)}
        {/* 질문 행 */}
        {cols.map((c, ci) => rows.map((r) => (
          <rect key={`${c.a}-${r.i}`} x={M.l + cw * ci} y={yOf[r.i]} width={cw - 1} height={rh - 1} fill={divColor(c.vals[r.i] / extent)}
            onMouseEnter={() => setHov({ a: c.a, q: r.q, v: c.vals[r.i] })} onClick={() => onPick?.(c.a)} style={{ cursor: "pointer" }}>
            <title>{`α ${c.a.toFixed(1)} · ${r.q} · ${fmt(c.vals[r.i])}`}</title>
          </rect>
        )))}
        {cur != null && cols.map((c, ci) => Math.abs(c.a - cur) < 1e-6 && (
          <rect key="cur" x={M.l + cw * ci - 0.5} y={meanY - 1} width={cw} height={H - meanY - 4} fill="none" stroke="#fff" strokeWidth="1.5" rx="2" />
        ))}
      </svg>
    </figure>
  );
}

/* ── 2. 리지라인: α별 점수 분포 ── */
function kde(vals, h, xs) {
  return xs.map((x) => vals.reduce((s, v) => s + Math.exp(-0.5 * ((x - v) / h) ** 2), 0) / (vals.length * h * Math.sqrt(2 * Math.PI)));
}
export function Ridgeline({ cols, extent, fmt, cur, onPick, label }) {
  const [W, ref] = useWidth();
  const M = { l: 56, r: 16, t: 14, b: 28 };
  const rowH = 24, ridgeH = rowH * 1.9;
  const H = M.t + cols.length * rowH + ridgeH - rowH + M.b;
  const X = (v) => M.l + ((v + extent) / (2 * extent)) * (W - M.l - M.r);
  const { dens, h } = useMemo(() => {
    const all = cols.flatMap((c) => c.vals);
    const m = all.reduce((s, v) => s + v, 0) / all.length;
    const sd = Math.sqrt(all.reduce((s, v) => s + (v - m) ** 2, 0) / (all.length - 1));
    const bw = 1.06 * sd * Math.pow(cols[0].vals.length, -0.2);   // Silverman 정규 기준, 모든 α에 공통
    const xs = Array.from({ length: 90 }, (_, i) => -extent + (2 * extent * i) / 89);
    const d = cols.map((c) => kde(c.vals, bw, xs));
    const mx = Math.max(...d.flat());
    return { dens: d.map((a) => a.map((v) => v / mx)), h: bw };
  }, [cols, extent]);
  const xs = Array.from({ length: 90 }, (_, i) => -extent + (2 * extent * i) / 89);

  return (
    <figure className="lc" ref={ref}>
      <div className="lc-read">
        <span className="lc-leg">α 오름차순으로 위→아래 · 반투명 면 = 40문 점수의 커널 밀도 · 흰 선 = 0 · 대역폭 h = {h.toFixed(3)} (Silverman, 모든 α 공통)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lc-svg" role="img" aria-label={label}>
        <title>{label}</title>
        {[-extent, -extent / 2, 0, extent / 2, extent].map((v) => (
          <g key={v}>
            <line x1={X(v)} x2={X(v)} y1={M.t} y2={H - M.b} className={v === 0 ? "lc-zero" : "lc-grid"} />
            <text x={X(v)} y={H - 10} className="lc-tick" textAnchor="middle">{fmt(v)}</text>
          </g>
        ))}
        {cols.map((c, ci) => {
          const base = M.t + ridgeH - rowH + (ci + 1) * rowH - rowH * 0.15;
          const pts = dens[ci].map((d, k) => [X(xs[k]), base - d * ridgeH]);
          const area = `M${X(xs[0])},${base} ${pts.map((p) => `L${p[0]},${p[1]}`).join(" ")} L${X(xs[xs.length - 1])},${base}Z`;
          const line = `M${pts.map((p) => p.join(",")).join(" L")}`;
          const isCur = cur != null && Math.abs(c.a - cur) < 1e-6;
          const mean = c.vals.reduce((s, v) => s + v, 0) / c.vals.length;
          return (
            <g key={c.a} onClick={() => onPick?.(c.a)} style={{ cursor: "pointer" }}>
              <title>{`α ${c.a.toFixed(1)} · 평균 ${fmt(mean)}`}</title>
              <path d={area} fill={mergeColor(c.a)} fillOpacity={isCur ? 0.55 : 0.28} />
              <path d={line} fill="none" stroke={isCur ? "#fff" : mergeColor(c.a)} strokeWidth={isCur ? 2 : 1.3} />
              <line x1={X(mean)} x2={X(mean)} y1={base - 7} y2={base + 2} stroke="#fff" strokeWidth="2" />
              <text x={M.l - 8} y={base + 3} textAnchor="end" className={`lc-tick ${isCur ? "rs-curtxt" : ""}`}>α {c.a.toFixed(1)}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/* ── 3. 출력 문자 구성 (100% 누적 영역) ── */
export const LAYERS = [
  { id: "han", name: "한글", color: COLORS.chat },
  { id: "lat", name: "영문·숫자", color: "#E69F00" },
  { id: "sym", name: "기호·기타", color: COLORS.merge },
  { id: "ws", name: "공백", color: "#5a647a" },
];
export function classShares(texts) {
  const n = { han: 0, lat: 0, sym: 0, ws: 0 };
  let total = 0;
  for (const t of texts) for (const ch of t || "") {
    total++;
    if (ch >= "가" && ch <= "힣") n.han++;
    else if (/[A-Za-z0-9]/.test(ch)) n.lat++;
    else if (/\s/.test(ch)) n.ws++;
    else n.sym++;
  }
  return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, total ? v / total : 0]));
}
export function StackedArea({ rows, lo, hi, cur, label }) {
  // rows: [{a, han, lat, sym, ws}] 오름차순
  const [W, ref] = useWidth();
  const [hov, setHov] = useState(null);
  const M = { l: 44, r: 86, t: 12, b: 30 };
  const H = 280;
  const X = (a) => M.l + ((a - lo) / (hi - lo)) * (W - M.l - M.r);
  const Y = (v) => M.t + (1 - v) * (H - M.t - M.b);
  const stacks = rows.map((r) => { let c = 0; const o = {}; LAYERS.forEach((l) => { o[l.id] = [c, c + r[l.id]]; c += r[l.id]; }); return o; });
  const focus = hov ?? (cur != null && rows.length ? rows.reduce((b, r) => (Math.abs(r.a - cur) < Math.abs(b - cur) ? r.a : b), rows[0].a) : null);
  const fr = rows.find((r) => r.a === focus);
  const last = rows[rows.length - 1];
  function onMove(e) {
    const rc = e.currentTarget.getBoundingClientRect();
    const v = lo + ((((e.clientX - rc.left) / rc.width) * W - M.l) / (W - M.l - M.r)) * (hi - lo);
    setHov(rows.reduce((b, r) => (Math.abs(r.a - v) < Math.abs(b - v) ? r.a : b), rows[0].a));
  }
  return (
    <figure className="lc" ref={ref}>
      <div className="lc-read" aria-live="polite">
        <span className="lc-x">α={focus != null ? focus.toFixed(1) : "–"}</span>
        {LAYERS.map((l) => (
          <span key={l.id} className="lc-leg"><i className="sw" style={{ background: l.color }} />{l.name}<b>{fr ? pct(fr[l.id]) : "–"}</b></span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lc-svg" role="img" aria-label={label} onMouseMove={onMove} onMouseLeave={() => setHov(null)}>
        <title>{label}</title>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}><line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} className="lc-grid" /><text x={M.l - 6} y={Y(v) + 4} textAnchor="end" className="lc-tick">{pct(v)}</text></g>
        ))}
        {[...new Set(rows.map((r) => r.a))].filter((_, i, arr) => arr.length < 13 || i % 2 === 0).map((a) => (
          <text key={a} x={X(a)} y={H - 10} className="lc-tick" textAnchor="middle">{a.toFixed(1)}</text>
        ))}
        {LAYERS.map((l) => {
          const top = rows.map((r, i) => `${X(r.a)},${Y(stacks[i][l.id][1])}`);
          const bot = rows.map((r, i) => `${X(r.a)},${Y(stacks[i][l.id][0])}`).reverse();
          return <polygon key={l.id} points={[...top, ...bot].join(" ")} fill={l.color} fillOpacity="0.78" stroke="#0c0f16" strokeWidth="1" />;
        })}
        {last && LAYERS.map((l, k) => {
          const [a, b] = stacks[stacks.length - 1][l.id];
          return b - a > 0.04 ? <text key={l.id} x={W - M.r + 8} y={Y((a + b) / 2) + 4} className="lc-tick" fill="#e4e8f0">{l.name}</text> : null;
        })}
        {focus != null && <line x1={X(focus)} x2={X(focus)} y1={M.t} y2={H - M.b} className="lc-cursor" />}
      </svg>
    </figure>
  );
}

/* ── 4. 전이 속도: 인접 α 구간의 증감 막대 ── */
export function DeltaBars({ steps, extent, cur, label }) {
  // steps: [{a0,a1,dHan,dCode}]
  const [W, ref] = useWidth();
  const [hov, setHov] = useState(null);
  const M = { l: 48, r: 14, t: 26, b: 30 };
  const H = 250;
  const Y = (v) => M.t + (1 - (v + extent) / (2 * extent)) * (H - M.t - M.b);
  const sw = (W - M.l - M.r) / steps.length;
  const peak = steps.reduce((b, s, i) => (Math.hypot(s.dHan, s.dCode) > Math.hypot(steps[b].dHan, steps[b].dCode) ? i : b), 0);
  const f = (v) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}pp`;
  const hs = hov ?? peak;
  return (
    <figure className="lc" ref={ref}>
      <div className="lc-read" aria-live="polite">
        <span className="lc-x">α {steps[hs].a0.toFixed(1)}→{steps[hs].a1.toFixed(1)}</span>
        <span className="lc-leg"><i className="sw" style={{ background: COLORS.chat }} />한글 변화<b>{f(steps[hs].dHan)}</b></span>
        <span className="lc-leg"><i className="sw hatch" />코드 변화<b>{f(steps[hs].dCode)}</b></span>
        <span className="lc-leg faint">{hov == null ? "가장 크게 변하는 구간" : ""}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lc-svg" role="img" aria-label={label} onMouseLeave={() => setHov(null)}>
        <title>{label}</title>
        <defs>
          <pattern id="db-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#FF8A3D" fillOpacity="0.25" /><line x1="0" y1="0" x2="0" y2="6" stroke="#FF8A3D" strokeWidth="3" />
          </pattern>
        </defs>
        {[-extent, -extent / 2, 0, extent / 2, extent].map((v) => (
          <g key={v}><line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} className={v === 0 ? "lc-zero" : "lc-grid"} /><text x={M.l - 6} y={Y(v) + 4} textAnchor="end" className="lc-tick">{f(v)}</text></g>
        ))}
        {steps.map((s, i) => {
          const x0 = M.l + sw * i, bw = sw * 0.34;
          const curIn = cur != null && cur >= s.a0 - 1e-9 && cur <= s.a1 + 1e-9;
          return (
            <g key={i} onMouseEnter={() => setHov(i)}>
              <rect x={x0} y={M.t} width={sw} height={H - M.t - M.b} fill={curIn ? "#fff" : "transparent"} fillOpacity="0.05" />
              <rect x={x0 + sw * 0.12} y={Math.min(Y(0), Y(s.dHan))} width={bw} height={Math.abs(Y(s.dHan) - Y(0))} fill={COLORS.chat} />
              <rect x={x0 + sw * 0.54} y={Math.min(Y(0), Y(s.dCode))} width={bw} height={Math.abs(Y(s.dCode) - Y(0))} fill="url(#db-hatch)" stroke="#FF8A3D" strokeWidth="1.2" />
              <text x={x0 + sw / 2} y={H - 10} textAnchor="middle" className="lc-tick">{s.a0.toFixed(1)}</text>
              {i === peak && <text x={x0 + sw / 2} y={M.t - 8} textAnchor="middle" className="lc-tick" fill="#F0E442">최대 변화</text>}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/* ── 5. 그룹 막대: 층(그룹)마다 두 시리즈를 나란히, 0선 기준, 선택적 95% 오차막대 ── */
export function GroupBars({ groups, series, extent, fmt, label, height = 260, baseNote }) {
  // groups: [{name, v:[a,b], ci:[a,b]?}], series: [{name,color,hatch}]
  const [W, ref] = useWidth();
  const [hov, setHov] = useState(null);
  const M = { l: 52, r: 14, t: 14, b: 32 };
  const H = height;
  const Y = (v) => M.t + (1 - (v + extent) / (2 * extent)) * (H - M.t - M.b);
  const gw = (W - M.l - M.r) / groups.length;
  const bw = Math.min(26, gw * 0.34);
  const pid = (i) => `gb-hatch-${i}`;
  const hg = hov != null ? groups[hov] : null;
  return (
    <figure className="lc" ref={ref}>
      <div className="lc-read" aria-live="polite">
        {series.map((s, i) => (
          <span key={s.name} className="lc-leg">
            <i className={`sw ${s.hatch ? "hatch" : ""}`} style={s.hatch ? { borderColor: s.color } : { background: s.color }} />{s.name}
            <b>{hg ? fmt(hg.v[i]) : "–"}</b>
          </span>
        ))}
        <span className="lc-leg faint">{hg ? hg.name : baseNote || "막대에 마우스를 올리면 값이 보입니다"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lc-svg" role="img" aria-label={label} onMouseLeave={() => setHov(null)}>
        <title>{label}</title>
        <defs>
          {series.map((s, i) => s.hatch && (
            <pattern key={i} id={pid(i)} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill={s.color} fillOpacity="0.22" /><line x1="0" y1="0" x2="0" y2="6" stroke={s.color} strokeWidth="3" />
            </pattern>
          ))}
        </defs>
        {[-extent, -extent / 2, 0, extent / 2, extent].map((v) => (
          <g key={v}><line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} className={v === 0 ? "lc-zero" : "lc-grid"} /><text x={M.l - 6} y={Y(v) + 4} textAnchor="end" className="lc-tick">{fmt(v)}</text></g>
        ))}
        {groups.map((g, gi) => {
          const x0 = M.l + gw * gi + gw / 2;
          return (
            <g key={g.name} onMouseEnter={() => setHov(gi)}>
              <rect x={M.l + gw * gi} y={M.t} width={gw} height={H - M.t - M.b} fill={hov === gi ? "#fff" : "transparent"} fillOpacity="0.05" />
              {g.v.map((v, si) => {
                const x = x0 + (si === 0 ? -bw - 1 : 1), s = series[si];
                return (
                  <g key={si}>
                    <rect x={x} y={Math.min(Y(0), Y(v))} width={bw} height={Math.max(1, Math.abs(Y(v) - Y(0)))}
                      fill={s.hatch ? `url(#${pid(si)})` : s.color} stroke={s.hatch ? s.color : "none"} strokeWidth="1.2" />
                    {g.ci && g.ci[si] != null && (
                      <g stroke="#fff" strokeWidth="1.6">
                        <line x1={x + bw / 2} x2={x + bw / 2} y1={Y(v - g.ci[si])} y2={Y(v + g.ci[si])} />
                        <line x1={x + bw / 2 - 4} x2={x + bw / 2 + 4} y1={Y(v - g.ci[si])} y2={Y(v - g.ci[si])} />
                        <line x1={x + bw / 2 - 4} x2={x + bw / 2 + 4} y1={Y(v + g.ci[si])} y2={Y(v + g.ci[si])} />
                      </g>
                    )}
                  </g>
                );
              })}
              <text x={x0} y={H - 10} textAnchor="middle" className="lc-tick">{g.name}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
