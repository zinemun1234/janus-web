"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { mergeColor, COLORS } from "../lib/metrics";

// 위상 궤적(PathChart)과 점 분포(StripChart) — 의존성 없는 SVG. 렌더 폭을 viewBox로 써서 글자 크기가 화면 폭과 무관.
const M = { l: 48, r: 16, t: 14, b: 34 };

export function useWidth(init = 700) {
  const [W, setW] = useState(init);
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
  return [W, ref];
}

const pct = (v) => `${(v * 100).toFixed(0)}%`;

/* ── 한글–코드 위상 궤적: α를 따라 이어진 (한글 비율, 코드 비율) 경로 ── */
export function PathChart({ points, cur, trail = [], label, height = 320 }) {
  const [W, ref] = useWidth();
  const H = height;
  const X = (v) => M.l + v * (W - M.l - M.r);
  const Y = (v) => M.t + (1 - v) * (H - M.t - M.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labeled = useMemo(() => {            // 겹치는 점은 라벨 생략 (탐욕적으로 24px 이상 떨어진 점만)
    const out = [];
    points.forEach((p) => {
      const px = X(p.x), py = Y(p.y);
      if (out.every((q) => Math.hypot(q.px - px, q.py - py) > 26)) out.push({ ...p, px, py });
    });
    return new Set(out.map((p) => p.a));
  }, [points, W]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <figure className="lc" ref={ref}>
      <div className="lc-read">
        <span className="lc-leg"><svg width="14" height="12" aria-hidden="true"><circle cx="7" cy="6" r="4" fill="#9aa3b6" /></svg>보간 α 0~1</span>
        <span className="lc-leg"><svg width="14" height="12" aria-hidden="true"><path d="M7 1L12 11H2Z" fill="#9aa3b6" /></svg>외삽 α&lt;0, α&gt;1</span>
        <span className="lc-leg"><svg width="14" height="12" aria-hidden="true"><circle cx="7" cy="6" r="5" fill="none" stroke="#fff" strokeWidth="1.5" /></svg>현재 α</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lc-svg" role="img" aria-label={label}>
        <title>{label}</title>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} className="lc-grid" />
            <line x1={X(v)} x2={X(v)} y1={M.t} y2={H - M.b} className="lc-grid" />
            <text x={M.l - 6} y={Y(v) + 4} className="lc-tick" textAnchor="end">{pct(v)}</text>
            <text x={X(v)} y={H - 16} className="lc-tick" textAnchor="middle">{pct(v)}</text>
          </g>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 2} className="lc-tick" textAnchor="middle">한글 비율</text>
        <text x={12} y={M.t + 4} className="lc-tick">코드 비율</text>
        <polyline fill="none" stroke="#6f798e" strokeWidth="1.5" strokeDasharray="4 3"
          points={points.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")} />
        {trail.slice(1).map((a, i) => {            // 최근에 지나온 경로: 오래될수록 투명
          const p0 = points.find((p) => Math.abs(p.a - trail[i]) < 1e-6), p1 = points.find((p) => Math.abs(p.a - a) < 1e-6);
          if (!p0 || !p1) return null;
          return <line key={i} x1={X(p0.x)} y1={Y(p0.y)} x2={X(p1.x)} y2={Y(p1.y)} stroke="#fff" strokeLinecap="round"
            strokeWidth="3" strokeOpacity={0.12 + 0.8 * ((i + 1) / Math.max(1, trail.length - 1))} />;
        })}
        {points.map((p) => {
          const ext = p.a < 0 || p.a > 1, c = mergeColor(p.a), x = X(p.x), y = Y(p.y);
          return (
            <g key={p.a}>
              <title>{`α ${p.a.toFixed(1)} · 한글 ${pct(p.x)} · 코드 ${pct(p.y)}`}</title>
              {ext ? <path d={`M${x} ${y - 6}L${x + 6} ${y + 5}L${x - 6} ${y + 5}Z`} fill={c} stroke="#0c0f16" strokeWidth="1" />
                   : <circle cx={x} cy={y} r="5.5" fill={c} stroke="#0c0f16" strokeWidth="1" />}
              {cur != null && Math.abs(p.a - cur) < 1e-6 && <circle cx={x} cy={y} r="10" fill="none" stroke="#fff" strokeWidth="1.8" />}
              {labeled.has(p.a) && <text x={x + 9} y={y - 8} className="lc-tick" fill="#c5ccda">{p.a.toFixed(1)}</text>}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/* ── 점 분포: 카테고리별 질문 점수(점)와 평균 ± 95% 오차범위 ── */
export function StripChart({ items, cats, catNames, domain, fmt, label, height = 300 }) {
  const [W, ref] = useWidth();
  const [hov, setHov] = useState(null);
  const H = height;
  const [y0, y1] = domain;
  const Y = (v) => M.t + (1 - (v - y0) / (y1 - y0)) * (H - M.t - M.b);
  const bw = (W - M.l - M.r) / cats.length;
  const cx = (ci) => M.l + bw * (ci + 0.5);
  const yt = [y0, y0 / 2, 0, y1 / 2, y1];

  const byCat = cats.map((c) => items.filter((it) => it.cat === c));
  const stats = byCat.map((arr) => {
    const n = arr.length, m = n ? arr.reduce((s, it) => s + it.v, 0) / n : 0;
    const sd = n > 1 ? Math.sqrt(arr.reduce((s, it) => s + (it.v - m) ** 2, 0) / (n - 1)) : 0;
    return { n, m, ci: n ? (1.96 * sd) / Math.sqrt(n) : 0 };
  });
  const jitter = (i) => (((i * 37 + 11) % 100) / 100 - 0.5) * bw * 0.62;   // 결정적 지터 (렌더마다 흔들리지 않음)

  return (
    <figure className="lc" ref={ref}>
      <div className="lc-read" aria-live="polite">
        {hov
          ? <><span className="lc-x">{catNames[hov.cat]}</span><span className="lc-leg">{hov.q}<b>{fmt(hov.v)}</b></span></>
          : <span className="lc-leg">점 = 질문 1개 · 채운 점은 +, 빈 점은 − · 흰 막대 = 평균 ± 95% 오차범위</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lc-svg" role="img" aria-label={label} onMouseLeave={() => setHov(null)}>
        <title>{label}</title>
        {yt.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} className="lc-grid" />
            <text x={M.l - 6} y={Y(v) + 4} className="lc-tick" textAnchor="end">{fmt(v)}</text>
          </g>
        ))}
        <line x1={M.l} x2={W - M.r} y1={Y(0)} y2={Y(0)} className="lc-zero" />
        {cats.map((c, ci) => (
          <g key={c}>
            <text x={cx(ci)} y={H - 10} className="lc-tick" textAnchor="middle">{catNames[c]} (n={stats[ci].n})</text>
            {byCat[ci].map((it, i) => (
              <g key={it.i} onMouseEnter={() => setHov(it)}>
                <title>{`${it.q} · ${fmt(it.v)}`}</title>
                {it.v > 0
                  ? <circle cx={cx(ci) + jitter(it.i)} cy={Y(Math.max(y0, Math.min(y1, it.v)))} r="4.6" fill={COLORS.ok} fillOpacity="0.9" />
                  : <circle cx={cx(ci) + jitter(it.i)} cy={Y(Math.max(y0, Math.min(y1, it.v)))} r="4.2" fill="none" stroke={COLORS.dark} strokeWidth="1.6" />}
              </g>
            ))}
            <line x1={cx(ci)} x2={cx(ci)} y1={Y(stats[ci].m + stats[ci].ci)} y2={Y(stats[ci].m - stats[ci].ci)} stroke="#fff" strokeWidth="2" />
            <line x1={cx(ci) - 16} x2={cx(ci) + 16} y1={Y(stats[ci].m)} y2={Y(stats[ci].m)} stroke="#fff" strokeWidth="3" />
            <line x1={cx(ci) - 7} x2={cx(ci) + 7} y1={Y(stats[ci].m + stats[ci].ci)} y2={Y(stats[ci].m + stats[ci].ci)} stroke="#fff" strokeWidth="2" />
            <line x1={cx(ci) - 7} x2={cx(ci) + 7} y1={Y(stats[ci].m - stats[ci].ci)} y2={Y(stats[ci].m - stats[ci].ci)} stroke="#fff" strokeWidth="2" />
          </g>
        ))}
      </svg>
    </figure>
  );
}
