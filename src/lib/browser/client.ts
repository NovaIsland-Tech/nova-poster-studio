import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | undefined;
export function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
export function supabase() {
  if (!configured()) throw new Error("请先配置 Supabase 连接");
  return (client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  ));
}
export function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
export async function rpc(action: string, data: unknown = {}) {
  const result = await supabase().rpc("nova_browser_action", {
    p_action: action,
    p_data: data,
  });
  check(result.error);
  return result.data;
}
