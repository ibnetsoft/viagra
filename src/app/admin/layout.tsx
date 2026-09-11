import AdminTheme from "@/components/admin-theme";
import "./theme.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "활력 파트너스 | 관리자 운영 사이트",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminTheme>{children}</AdminTheme>;
}
