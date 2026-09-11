import "server-only";
import { createClient } from "@supabase/supabase-js";
export function loginDirectory() {
 const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
 if (!key) throw new Error("Login directory unavailable");
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function resolveLoginEmail(username: string): Promise<string | null> {
 const { data, error } = await loginDirectory().rpc("resolve_login_email", { p_username: username });
 if (error) throw new Error("Login directory unavailable");
 return typeof data === "string" ? data : null;
}
