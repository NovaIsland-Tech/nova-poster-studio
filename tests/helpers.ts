import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";
export function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export function publicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export function checked(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
export async function fixture(role: "admin" | "member" = "member") {
  const db = service(),
    email = `nova-browser-qa-${randomUUID()}@example.com`,
    password = randomUUID() + "Aa1!",
    token = randomUUID();
  const admin = await db
    .from("nova_profiles")
    .select("id")
    .eq("email", "yuhou24@gmail.com")
    .single();
  checked(admin.error);
  checked(
    (
      await db
        .from("nova_invitations")
        .insert({
          email,
          token_hash: createHash("sha256").update(token).digest("hex"),
          name: "QA temporary",
          credits: 20,
          flagship: true,
          created_by: admin.data!.id,
        })
    ).error,
  );
  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { invite_token: token },
  });
  checked(created.error);
  const id = created.data.user!.id;
  if (role === "admin")
    checked(
      (await db.from("nova_profiles").update({ role: "admin" }).eq("id", id))
        .error,
    );
  const client = publicClient();
  checked((await client.auth.signInWithPassword({ email, password })).error);
  return { id, email, password, client };
}
export async function cleanup(user: { id: string; email: string }) {
  const db = service();
  for (const folder of ["assets", "outputs"]) {
    const files = await db.storage
      .from("nova-private")
      .list(`${user.id}/${folder}`);
    if (files.data?.length)
      checked(
        (
          await db.storage
            .from("nova-private")
            .remove(files.data.map((f) => `${user.id}/${folder}/${f.name}`))
        ).error,
      );
  }
  checked(
    (
      await db
        .from("nova_invitations")
        .delete()
        .or(`email.eq.${user.email},created_by.eq.${user.id}`)
    ).error,
  );
  for (const [table, col] of [
    ["nova_ledger", "user_id"],
    ["nova_jobs", "user_id"],
    ["nova_assets", "user_id"],
    ["nova_audit", "actor_id"],
    ["nova_profiles", "id"],
  ])
    checked((await db.from(table).delete().eq(col, user.id)).error);
  checked((await db.auth.admin.deleteUser(user.id)).error);
}
