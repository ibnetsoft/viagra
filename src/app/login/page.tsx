import MemberTheme from "@/components/member-theme";
import Login from "@/components/login";
import { configured } from "@/lib/supabase/server";
import "../app/member.css";
export default function Page() {
  return (
    <MemberTheme>
      <Login connected={configured()} />
    </MemberTheme>
  );
}
