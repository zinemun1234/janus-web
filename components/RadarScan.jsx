"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { mergeColor, COLORS } from "../lib/metrics";

// 레이더 스캔 — α를 240° 게이지 호 위에 펼치고, 한글/코드/반복률을 반지름으로 그린 네온 극좌표 차트.
// 빔이 현재 α를 가리키고, 호 위의 눈금을 누르면 그 α로 이동한다. 모든 값은 실제 생성 텍스트에서 계산된 것.
const SPAN = 240, START = 150;           // 호의 시작 각도(SVG 각도, 시계 방향)와 범위
const SERIES = [
  { id: "han", name: "한글", color: COLORS.chat, shape: "circle" },
  { id: "code", name: "코드", color: "#FF8A3D", shape: "square" },
  { id: "rep", name: "반복", color: COLORS.merge, shape: "diamond" },
];
const pct = (v) => `${(v * 100).toFixed(0)}%`;
const rad = (d) => (d * Math.PI) / 180;

function Dot({ shape, x, y, c, r = 4 }) {
  if (shape === "square") return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill={c} />;
  if (shape === "diamond") return <path d={`M${x} ${y - r - 1}L${x + r + 1} ${y}L${x} ${y + r + 1}L${x - r - 1} ${y}Z`} fill={c} />;
  return <circle cx={x} cy={y} r={r} fill={c} />;
}

export default function RadarScan({ points, cur, lo, hi, onPick, label }) {
  const [W, setW] = useState(640);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(Math.max(300, Math.round(el.getBoundingClientRect().width)));
    measure();
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  const S = Math.min(W, 620), H = Math.round(S * 0.9);
  const cx = S / 2, cy = S * 0.5, R = S * 0.38, r0 = R * 0.36;
  const ang = (a) => START + ((a - lo) / (hi - lo)) * SPAN;
  const pt = (a, v) => { const t = rad(ang(a)); const r = r0 + v * (R - r0); return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; };
  const arcPath = (rr, a0, a1) => {
    const [x0, y0] = [cx + rr * Math.cos(rad(a0)), cy + rr * Math.sin(rad(a0))];
    const [x1, y1] = [cx + rr * Math.cos(rad(a1)), cy + rr * Math.sin(rad(a1))];
    return `M${x0} ${y0}A${rr} ${rr} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };

  const rows = useMemo(() => points.map((p) => ({ ...p })), [points]);
  const curRow = rows.reduce((b, p) => (!b || Math.abs(p.a - cur) < Math.abs(b.a - cur) ? p : b), null);
  const beamDeg = ang(Math.max(lo, Math.min(hi, cur)));
  const rings = [0, 0.25, 0.5, 0.75, 1];
  const areaFor = (id) => {
    const top = rows.map((p) => pt(p.a, p[id]).join(",")).join(" ");
    const bottom = [...rows].reverse().map((p) => pt(p.a, 0).join(",")).join(" ");
    return `${top} ${bottom}`;
  };

  return (
    <figure className="radar" ref={ref}>
      <div className="lc-read">
        {SERIES.map((s) => (
          <span key={s.id} className="lc-leg">
            <svg width="16" height="12" aria-hidden="true"><Dot shape={s.shape} x={8} y={6} c={s.color} r={3.6} /></svg>{s.name}
          </span>
        ))}
        <span className="lc-leg faint">눈금을 누르면 그 α로 이동</span>
      </div>
      <svg viewBox={`0 0 ${S} ${H}`} className="radar-svg" role="img" aria-label={label} style={{ width: S, maxWidth: "100%" }}>
        <title>{label}</title>
        <defs>
          <filter id="rs-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="rs-bg" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#16213a" stopOpacity="0.9" /><stop offset="100%" stopColor="#0c0f16" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="rs-beam" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" /><stop offset="100%" stopColor="#fff" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="rs-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#56B4E9" stopOpacity="0" /><stop offset="100%" stopColor="#56B4E9" stopOpacity="0.22" />
          </linearGradient>
        </defs>

        <circle cx={cx} cy={cy} r={R * 1.08} fill="url(#rs-bg)" />

        {/* 눈금 링 + 호 */}
        {rings.map((v) => (
          <g key={v}>
            <path d={arcPath(r0 + v * (R - r0), START, START + SPAN)} className="rs-ring" />
            {/* 라벨은 호가 비어 있는 아래쪽 틈(90°)에 세로로 배치 */}
            <text x={cx} y={cy + (r0 + v * (R - r0)) + 4} className="lc-tick" textAnchor="middle">{pct(v)}</text>
          </g>
        ))}

        {/* 장식용 회전 스캔 (움직임 감소 설정이면 정지) */}
        <g className="rs-spin" style={{ transformOrigin: `${cx}px ${cy}px` }} aria-hidden="true">
          <path d={`M${cx} ${cy}L${cx + R} ${cy}A${R} ${R} 0 0 0 ${cx + R * Math.cos(rad(-28))} ${cy + R * Math.sin(rad(-28))}Z`} fill="url(#rs-sweep)" />
        </g>

        {/* 스포크 + α 눈금(클릭 가능) */}
        {rows.map((p) => {
          const [x0, y0] = pt(p.a, 0), [x1, y1] = pt(p.a, 1.04);
          const t = rad(ang(p.a)), lx = cx + (R + 22) * Math.cos(t), ly = cy + (R + 22) * Math.sin(t);
          const isCur = curRow && p.a === curRow.a;
          return (
            <g key={p.a} className="rs-tick" onClick={() => onPick?.(p.a)} role="button" tabIndex={0} aria-label={`α ${p.a.toFixed(1)}로 이동`}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick?.(p.a)}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} className={isCur ? "rs-spoke cur" : "rs-spoke"} />
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="transparent" strokeWidth="16" />
              <text x={lx} y={ly + 4} className={`lc-tick ${isCur ? "rs-curtxt" : ""}`} textAnchor="middle">{p.a.toFixed(1)}</text>
            </g>
          );
        })}

        {/* 영역 + 네온 선 */}
        {SERIES.map((s) => (
          <polygon key={`a-${s.id}`} points={areaFor(s.id)} fill={s.color} fillOpacity="0.07" stroke="none" />
        ))}
        {SERIES.map((s) => {
          const d = rows.map((p, i) => `${i ? "L" : "M"}${pt(p.a, p[s.id]).join(" ")}`).join("");
          return (
            <g key={s.id}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="3" strokeOpacity="0.9" filter="url(#rs-glow)" />
              <path d={d} fill="none" stroke={s.color} strokeWidth="1.8" />
              {rows.map((p) => { const [x, y] = pt(p.a, p[s.id]); return <Dot key={p.a} shape={s.shape} x={x} y={y} c={s.color} r={3.4} />; })}
            </g>
          );
        })}

        {/* 빔: 현재 α */}
        <g className="rs-beam" style={{ transform: `rotate(${beamDeg}deg)`, transformOrigin: `${cx}px ${cy}px` }} aria-hidden="true">
          <line x1={cx + r0} y1={cy} x2={cx + R * 1.04} y2={cy} stroke="url(#rs-beam)" strokeWidth="2" filter="url(#rs-glow)" />
          <circle cx={cx + R * 1.04} cy={cy} r="4" fill="#fff" filter="url(#rs-glow)" />
        </g>

        {/* 중앙 판독 */}
        <circle cx={cx} cy={cy} r={r0 - 6} fill="#0c0f16" stroke="#262e40" />
        <text x={cx} y={cy - 6} textAnchor="middle" className="rs-alpha" fill={mergeColor(cur)}>α {cur.toFixed(1)}</text>
        {curRow && SERIES.map((s, i) => (
          <g key={s.id}>
            <Dot shape={s.shape} x={cx - 34} y={cy + 12 + i * 15 - 3} c={s.color} r={3} />
            <text x={cx - 24} y={cy + 12 + i * 15} className="rs-read">{s.name} {pct(curRow[s.id])}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
