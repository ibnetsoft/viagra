import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "활력 파트너스 | 회원·정산 관리",
  description: "활력 파트너스 회원, 구매, 배송 및 보너스 관리",
  robots: { index: false, follow: false },
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
