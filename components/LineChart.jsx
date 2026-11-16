"use client";
import { useEffect, useMemo, useRef, useState } from "react";

// 의존성 없는 SVG 라인차트 — 색 + 마커 모양 + 선 스타일로 구분(색에만 의존하지 않음), 호버 시 값 판독, aria 라벨.
const M = { l: 48, r: 16, t: 12, b: 30 };

function Marker({ shape, x, y, c, r = 4.2 }) {
  if (shape === "square") return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill={c} />;
  if (shape === "triangle") return <path d={`M${x} ${y - r - 1}L${x + r + 1} ${y + r}L${x - r - 1} ${y + r}Z`} fill={c} />;
  if (shape === "diamond") return <path d={`M${x} ${y - r - 1}L${x + r + 1} ${y}L${x} ${y + r + 1}L${x - r - 1} ${y}Z`} fill={c} />;
  return <circle cx={x} cy={y} r={r} fill={c} />;
}

export default function LineChart({
  series, xDomain = [0, 1], yDomain = [0, 1], xTicks, yTicks, yFmt = (v) => v.toFixed(2),
  cursorX, bands = [], zeroLine = false, label, height = 230, unit = "α",
}) {
  const [hover, setHover] = useState(null);
  const [W, setW] = useState(760);          // 실제 렌더 폭(px)을 viewBox로 써서 글자 크기가 화면 폭과 무관하게 유지됨
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setW(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    measure();                                   // RO가 발동하지 않는 환경(숨겨진 패널 등)에서도 첫 렌더 폭을 맞춤
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const H = height;
  const [x0, x1] = xDomain, [y0, y1] = yDomain;
  const X = (v) => M.l + ((v - x0) / (x1 - x0)) * (W - M.l - M.r);
  const Y = (v) => M.t + (1 - (v - y0) / (y1 - y0)) * (H - M.t - M.b);
  const xt = xTicks || Array.from({ length: 6 }, (_, i) => x0 + ((x1 - x0) * i) / 5);
  const yt = yTicks || Array.from({ length: 5 }, (_, i) => y0 + ((y1 - y0) * i) / 4);

  const xs = useMemo(() => [...new Set(series.flatMap((s) => s.pts.map((p) => p[0])))].sort((a, b) => a - b), [series]);
  const nearest = (v) => xs.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), xs[0]);
  const focus = hover ?? (cursorX != null && xs.length ? nearest(cursorX) : null);
  const valAt = (s, x) => (s.pts.find((p) => p[0] === x) || [])[1];

  function onMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const v = x0 + ((((e.clientX - r.left) / r.width) * W - M.l) / (W - M.l - M.r)) * (x1 - x0);
    if (xs.length) setHover(nearest(Math.max(x0, Math.min(x1, v))));
  }

  return (
    <figure className="lc" ref={ref}>
      <div className="lc-read" aria-live="polite">
        <span className="lc-x">{unit}={focus != null ? focus.toFixed(1) : "–"}</span>
        {series.map((s) => (
          <span key={s.id} className="lc-leg">
            <svg width="22" height="12" aria-hidden="true">
              <line x1="0" y1="6" x2="22" y2="6" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash || "none"} />
              <Marker shape={s.shape} x={11} y={6} c={s.color} r={3.4} />
            </svg>
            {s.name}
            <b>{focus != null && valAt(s, focus) != null ? yFmt(valAt(s, focus)) : "–"}</b>
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lc-svg" role="img" aria-label={label}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <title>{label}</title>
        {bands.map(([a, b], i) => (
          <rect key={i} x={X(a)} y={M.t} width={X(b) - X(a)} height={H - M.t - M.b} className="lc-band" />
        ))}
        {yt.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} className="lc-grid" />
            <text x={M.l - 6} y={Y(v) + 4} className="lc-tick" textAnchor="end">{yFmt(v)}</text>
          </g>
        ))}
        {xt.map((v) => (
          <text key={v} x={X(v)} y={H - 8} className="lc-tick" textAnchor="middle">{v.toFixed(1)}</text>
        ))}
        {zeroLine && y0 < 0 && y1 > 0 && <line x1={M.l} x2={W - M.r} y1={Y(0)} y2={Y(0)} className="lc-zero" />}
        {series.map((s) => (
          <g key={s.id}>
            {s.ribbon && s.pts.length > 1 && (
              <polygon fill={s.color} fillOpacity="0.18" stroke="none"
                points={[...s.pts.map((p) => `${X(p[0])},${Y(Math.min(y1, p[1] + (p[2] || 0)))}`),
                  ...[...s.pts].reverse().map((p) => `${X(p[0])},${Y(Math.max(y0, p[1] - (p[2] || 0)))}`)].join(" ")} />
            )}
            <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash || "none"}
              points={s.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(" ")} />
            {s.pts.map((p) => <Marker key={p[0]} shape={s.shape} x={X(p[0])} y={Y(p[1])} c={s.color} />)}
          </g>
        ))}
        {focus != null && <line x1={X(focus)} x2={X(focus)} y1={M.t} y2={H - M.b} className="lc-cursor" />}
      </svg>
    </figure>
  );
}
