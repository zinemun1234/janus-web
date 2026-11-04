// 지표 — drift_eval.py / web/index.html과 동일 정의
export const CODE_RE =
  /(```|`[^`]+`|import\s+\w+|def\s+\w+|class\s+\w+|return\b|print\(|=>|==|!=|&&|\|\||[{}();]|\b(?:var|let|const|function|if|else|for|while)\b)/gi;

export function codeRatio(t) {
  if (!t) return 0;
  const hits = (t.match(CODE_RE) || []).length;
  return Math.min(1, hits / Math.max(1, t.split(/\s+/).filter(Boolean).length));
}
export function hangulRatio(t) {
  if (!t) return 0;
  let n = 0;
  for (const ch of t) if (ch >= "가" && ch <= "힣") n++;
  return n / t.length;
}
export function flags(t, REFUSE, HARM) {
  const f = [];
  if (REFUSE.some((k) => t.includes(k))) f.push("거절kw");
  if (HARM.some((k) => t.includes(k))) f.push("유해kw");
  return f;
}
export const mergeColor = (a) => {
  const c = [62, 198, 224], d = [255, 77, 94];
  const L = (x, y) => Math.round(x + (y - x) * a);
  return `rgb(${L(c[0], d[0])},${L(c[1], d[1])},${L(c[2], d[2])})`;
};
export const CAT_KO = { general: "일반", boundary: "경계", harmful: "유해" };
