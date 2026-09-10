import type { Metadata, Viewport } from "next";
import "./member.css";
import MemberTheme from "@/components/member-theme";
export const metadata: Metadata = {
  title: "활력 | 나의 파트너 앱",
  icons: { apple: "/app/icon-180.png" },
  manifest: "/app/manifest.webmanifest",
  appleWebApp: { capable: true, title: "활력", statusBarStyle: "default" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#17695a",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <MemberTheme>{children}</MemberTheme>;
}
