import { createClient } from "npm:@supabase/supabase-js@2.116.0";
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const allowed = new Set([
  "https://nova-poster-studio.pages.dev",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function checked(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (allowed.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowed.has(origin))
    return reply({ error: "不允许的来源" }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "仅支持 POST" }, 405);
  try {
    const authorization = req.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer "))
      return reply({ error: "请先登录" }, 401);
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      options,
    );
    // Validate against Auth, then read live role. User-editable metadata is never authority.
    const verified = await db.auth.getUser(authorization.slice(7));
    if (verified.error || !verified.data.user)
      return reply({ error: "登录已失效" }, 401);
    const actor = verified.data.user.id;
    const admin = await db
      .from("nova_profiles")
      .select("role,active,expires_at,deleted_at")
      .eq("id", actor)
      .single();
    if (
      admin.error ||
      admin.data.role !== "admin" ||
      !admin.data.active ||
      admin.data.deleted_at ||
      (admin.data.expires_at &&
        new Date(admin.data.expires_at).getTime() <= Date.now())
    )
      return reply({ error: "仅有效管理员可操作" }, 403);
    const raw = await req.text();
    if (raw.length > 12000) return reply({ error: "请求过大" }, 413);
    const body = JSON.parse(raw);
    if (body.action === "create") {
      const email = String(body.email || "")
        .trim()
        .toLowerCase();
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return reply({ error: "请输入有效邮箱" }, 400);
      const name = String(body.name || email.split("@")[0])
        .trim()
        .slice(0, 60);
      const credits = body.credits === undefined ? 2 : Number(body.credits);
      if (!Number.isInteger(credits) || credits < 0 || credits > 100000)
        return reply({ error: "额度必须为 0–100000 的整数" }, 400);
      const expires = body.expires_at || null;
      if (expires && !Number.isFinite(Date.parse(expires)))
        return reply({ error: "到期时间无效" }, 400);
      const existing = await db
        .from("nova_profiles")
        .select("id")
        .eq("email", email)
        .is("deleted_at", null)
        .maybeSingle();
      checked(existing.error);
      if (existing.data)
        return reply({ error: "该邮箱已有账号，请在成员列表管理" }, 409);
      const token = crypto.randomUUID();
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(token),
      );
      const hash = Array.from(new Uint8Array(digest), (v) =>
        v.toString(16).padStart(2, "0"),
      ).join("");
      checked(
        (
          await db
            .from("nova_invitations")
            .upsert(
              {
                email,
                token_hash: hash,
                name,
                credits,
                flagship: body.flagship === true,
                member_expires_at: expires,
                created_by: actor,
                expires_at: new Date(Date.now() + 3600000).toISOString(),
                used_at: null,
              },
              { onConflict: "email" },
            )
        ).error,
      );
      const created = await db.auth.admin.createUser({
        email,
        password: "123456",
        email_confirm: true,
        user_metadata: { invite_token: token },
        app_metadata: { nova_managed: true },
      });
      if (created.error) {
        await db
          .from("nova_invitations")
          .delete()
          .eq("email", email)
          .eq("token_hash", hash);
        return reply({ error: created.error.message }, 400);
      }
      // Auth may update its password/metadata after INSERT; initialize the prompt
      // only after createUser completes so those internal updates cannot clear it.
      checked(
        (
          await db
            .from("nova_profiles")
            .update({ password_state: "temporary", password_prompt: true })
            .eq("id", created.data.user.id)
        ).error,
      );
      checked(
        (
          await db
            .from("nova_audit")
            .insert({
              actor_id: actor,
              action: "member.create",
              detail: created.data.user.id,
            })
        ).error,
      );
      return reply({
        id: created.data.user.id,
        email,
        initialPassword: "123456",
        credits,
      });
    }
    if (
      !["reset-password", "delete"].includes(body.action) ||
      !uuid.test(String(body.id))
    )
      return reply({ error: "无效操作" }, 400);
    const target = await db
      .from("nova_profiles")
      .select("*")
      .eq("id", body.id)
      .single();
    checked(target.error);
    if (!target.data || target.data.role !== "member" || body.id === actor)
      return reply({ error: "此操作仅适用于普通成员" }, 403);
    if (target.data.deleted_at) {
      if (body.action === "delete") return reply({ ok: true });
      return reply({ error: "成员已删除" }, 400);
    }
    if (body.action === "reset-password") {
      if (target.data.deletion_pending)
        return reply({ error: "该账号正在删除，请先完成删除" }, 400);
      checked(
        (await db.auth.admin.updateUserById(body.id, { password: "123456" }))
          .error,
      );
      checked(
        (
          await db
            .from("nova_profiles")
            .update({ password_state: "temporary", password_prompt: true })
            .eq("id", body.id)
        ).error,
      );
      checked(
        (
          await db
            .from("nova_audit")
            .insert({
              actor_id: actor,
              action: "member.password.reset",
              detail: body.id,
            })
        ).error,
      );
      return reply({ initialPassword: "123456" });
    }
    checked(
      (
        await db.rpc("nova_prepare_member_delete", {
          p_actor: actor,
          p_user: body.id,
        })
      ).error,
    );
    let removed = 0;
    async function purge(prefix: string, depth = 0): Promise<void> {
      if (depth > 16) throw new Error("素材目录层级过深，请联系管理员处理");
      while (true) {
        const files = await db.storage
          .from("nova-private")
          .list(prefix, { limit: 100 });
        checked(files.error);
        if (!files.data?.length) return;
        const objects: string[] = [];
        for (const file of files.data) {
          if (file.id) objects.push(`${prefix}/${file.name}`);
          else await purge(`${prefix}/${file.name}`, depth + 1);
        }
        if (objects.length) {
          checked(
            (await db.storage.from("nova-private").remove(objects)).error,
          );
          removed += objects.length;
        }
        if (removed >= 10000)
          throw new Error("图片较多，已删除部分，请再次点击删除继续");
      }
    }
    await purge(body.id);
    // Irreversible Auth soft deletion removes credentials and sessions while
    // preserving a tombstone referenced by the retained financial history.
    const authUser = await db.auth.admin.getUserById(body.id);
    checked(authUser.error);
    if (!(authUser.data.user as unknown as { deleted_at?: string })?.deleted_at)
      checked((await db.auth.admin.deleteUser(body.id, true)).error);
    checked(
      (
        await db.rpc("nova_finalize_member_delete", {
          p_actor: actor,
          p_user: body.id,
        })
      ).error,
    );
    return reply({ ok: true });
  } catch (e) {
    return reply(
      { error: e instanceof Error ? e.message : "操作失败，请重试" },
      400,
    );
  }
});
