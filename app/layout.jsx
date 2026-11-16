import "./globals.css";

export const metadata = {
  title: "JANUS — two faces of one model",
  description: "42M 한국어 LM의 창발적 정렬 붕괴(EM) 시각화 — chat↔dark α 머지 전이 탐색기 + 라이브 데모",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      {/* 브라우저 확장(예: ap-style 속성 주입)이 body 속성을 바꿔도 하이드레이션 경고가 뜨지 않게 함 */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
