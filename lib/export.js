// 내려받기 유틸 — 차트(SVG/PNG)와 데이터(CSV/JSON). 의존성 없음.
export function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function toCSV(rows) {
  const esc = (v) => {
    if (v == null) return "";
    const s = typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(+v.toFixed(5))) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}
// 한글이 깨지지 않도록 UTF-8 BOM을 붙인다 (엑셀 호환)
export const csvBlob = (rows) => new Blob(["﻿" + toCSV(rows)], { type: "text/csv;charset=utf-8" });
export const jsonBlob = (obj) => new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" });

const STYLE_PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap",
  "opacity", "font-family", "font-size", "font-weight", "text-anchor", "display"];

// CSS 클래스로 칠해진 속성을 복제본에 인라인으로 박아 넣어, 단독 SVG 파일에서도 같은 모양이 나오게 한다.
function inlineStyles(src, clone) {
  const a = [src, ...src.querySelectorAll("*")], b = [clone, ...clone.querySelectorAll("*")];
  a.forEach((el, i) => {
    const cs = getComputedStyle(el), t = b[i];
    if (!t || !t.style) return;
    STYLE_PROPS.forEach((p) => { const v = cs.getPropertyValue(p); if (v) t.style.setProperty(p, v); });
  });
}

// 여러 차트의 id가 겹치지 않게 접두어를 붙인다 (패턴·필터 참조 보존)
function prefixIds(str, k) {
  return str.replace(/id="([^"]+)"/g, `id="c${k}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#c${k}-$1)`);
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** figs: [{title, caption, svg(Element)}] → 한 장의 SVG 문자열(제목+차트 세로 배치) */
export function composeSvg(figs, { bg = "#0c0f16", pad = 24, title = "JANUS" } = {}) {
  const W = Math.max(...figs.map((f) => Math.round(f.svg.getBoundingClientRect().width))) + pad * 2;
  let y = pad + 26;
  const parts = [`<text x="${pad}" y="${pad + 8}" fill="#e4e8f0" font-size="18" font-weight="700" font-family="Malgun Gothic, Segoe UI, sans-serif">${esc(title)}</text>`];
  figs.forEach((f, k) => {
    const r = f.svg.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height);
    const clone = f.svg.cloneNode(true);
    inlineStyles(f.svg, clone);
    clone.setAttribute("x", pad); clone.setAttribute("y", y + 36); clone.setAttribute("width", w); clone.setAttribute("height", h);
    clone.removeAttribute("style"); clone.removeAttribute("class");
    clone.querySelectorAll("title").forEach((t) => t.remove());
    parts.push(`<text x="${pad}" y="${y + 14}" fill="#e4e8f0" font-size="14" font-weight="600" font-family="Malgun Gothic, Segoe UI, sans-serif">${esc(f.title)}</text>`);
    if (f.caption) parts.push(`<text x="${pad}" y="${y + 32}" fill="#9aa3b6" font-size="11" font-family="Malgun Gothic, Segoe UI, sans-serif">${esc(f.caption.slice(0, 140))}</text>`);
    parts.push(prefixIds(new XMLSerializer().serializeToString(clone), k));
    y += h + 36 + 30;
  });
  const H = y + pad - 14;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="${bg}"/>${parts.join("")}</svg>`;
}

export const svgBlob = (str) => new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${str}`], { type: "image/svg+xml;charset=utf-8" });

export function svgToPngBlob(str, scale = 2) {
  return new Promise((resolve, reject) => {
    const m = str.match(/width="(\d+)" height="(\d+)"/);
    const w = +m[1], h = +m[2];
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = w * scale; cv.height = h * scale;
      const ctx = cv.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, h);
      cv.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG 변환 실패"))), "image/png");
    };
    img.onerror = () => reject(new Error("SVG 이미지 로드 실패"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str);
  });
}
