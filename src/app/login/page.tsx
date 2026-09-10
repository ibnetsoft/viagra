import Login from "@/components/login";
import { configured } from "@/lib/supabase/server";
import "../app/member.css";
export default function Page() {
  return <Login connected={configured()} />;
}
