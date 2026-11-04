import "./globals.css";

export const metadata = {
  title: "JANUS — two faces of one model",
  description: "42M 한국어 LM의 창발적 정렬 붕괴(EM) 시각화 — chat↔dark α 머지 전이 탐색기 + 라이브 데모",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
