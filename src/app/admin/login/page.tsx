import Login from "@/components/login";
import { configured } from "@/lib/supabase/server";
export default function Page() {
  return <Login connected={configured()} admin />;
}
