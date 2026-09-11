import "server-only";
import { createClient } from "@supabase/supabase-js";
export async function resolveLoginEmail(username: string): Promise<string | null> {
 const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
 if (!key) throw new Error("Login directory unavailable");
 const directory = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
 const { data, error } = await directory.rpc("resolve_login_email", { p_username: username });
 if (error) throw new Error("Login directory unavailable");
 return typeof data === "string" ? data : null;
}
