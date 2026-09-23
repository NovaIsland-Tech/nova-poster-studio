import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { fixture, cleanup, service, publicClient, checked } from "../helpers";
test("admin account lifecycle, first-login password choices and access boundaries", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const admin = await fixture("admin"),
    email = `nova-managed-${randomUUID()}@example.com`;
  let id = "";
  const ac = await browser.newContext(),
    mc = await browser.newContext();
  const a = await ac.newPage(),
    m = await mc.newPage();
  async function login(
    page: typeof a,
    mail: string,
    password: string,
    next = "",
  ) {
    await page.goto("/login/" + next);
    await page.getByLabel("邮箱", { exact: true }).fill(mail);
    await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "进入工作台" }).click();
  }
  try {
    await login(a, admin.email, admin.password, "?next=/admin");
    await a.getByRole("button", { name: "成员与额度", exact: true }).click();
    await a.getByRole("button", { name: "添加成员", exact: true }).click();
    await a.getByLabel("邮箱", { exact: true }).fill(email);
    await expect(a.getByLabel("初始额度", { exact: true })).toHaveValue("2");
    await a.getByRole("button", { name: "创建成员账号" }).click();
    await expect(
      a.getByText(
        "成员已创建，可直接登录。初始密码为 123456，首次登录可选择修改或跳过。",
      ),
    ).toBeVisible({ timeout: 30000 });
    const db = service();
    const p = await db
      .from("nova_profiles")
      .select("*")
      .eq("email", email)
      .single();
    checked(p.error);
    id = p.data.id;
    expect(p.data.credits).toBe(2);
    expect(p.data.password_prompt).toBe(true);
    expect(p.data.password_state).toBe("temporary");
    await a.getByRole("button", { name: "关闭", exact: true }).click();
    await a.screenshot({ path: ".nova/members-admin.png", fullPage: true });
    await login(m, email, "123456");
    await expect(
      m.getByRole("dialog", { name: "设置你的登录密码" }),
    ).toBeVisible();
    await m.screenshot({ path: ".nova/members-welcome.png", fullPage: true });
    await m.getByRole("button", { name: "暂时跳过" }).click();
    await expect(
      m.getByRole("heading", { name: /让想法.*有点看头/ }),
    ).toBeVisible();
    await m.reload();
    await expect(
      m.getByRole("heading", { name: /让想法.*有点看头/ }),
    ).toBeVisible();
    await expect(
      m.getByRole("dialog", { name: "设置你的登录密码" }),
    ).toHaveCount(0);
    const member = publicClient();
    checked(
      (await member.auth.signInWithPassword({ email, password: "123456" }))
        .error,
    );
    const denied = await member.functions.invoke("nova-members", {
      body: { action: "reset-password", id: admin.id },
    });
    expect(denied.error).toBeTruthy();
    const forged = await member.rpc("nova_prepare_member_delete", {
      p_actor: admin.id,
      p_user: id,
    });
    expect(forged.error).toBeTruthy();
    const anonymous = await publicClient().functions.invoke("nova-members", {
      body: { action: "create", email: "unauthorized@example.com" },
    });
    expect(anonymous.error).toBeTruthy();
    const row = a.getByRole("row").filter({ hasText: email });
    await row.getByRole("button", { name: "管理", exact: true }).click();
    await a.getByLabel("调整额度", { exact: false }).fill("3");
    await a.getByRole("button", { name: "保存变更", exact: true }).click();
    await expect(row).toContainText("5 点");
    await row.getByRole("button", { name: "管理", exact: true }).click();
    a.once("dialog", (d) => d.accept());
    await a.getByRole("button", { name: "重置密码为 123456" }).click();
    await expect(
      a.getByText("密码已重置为 123456，重新登录后将提示修改。"),
    ).toBeVisible();
    await login(m, email, "123456");
    await expect(
      m.getByRole("dialog", { name: "设置你的登录密码" }),
    ).toBeVisible();
    await m.getByLabel("新密码", { exact: false }).first().fill("654321");
    await m.getByLabel("确认新密码", { exact: true }).fill("654321");
    await m.getByRole("button", { name: "保存密码，开始创作" }).click();
    await expect(
      m.getByRole("heading", { name: /让想法.*有点看头/ }),
    ).toBeVisible();
    const changed = await db
      .from("nova_profiles")
      .select("password_state,password_prompt")
      .eq("id", id)
      .single();
    expect(changed.data).toEqual({
      password_state: "changed",
      password_prompt: false,
    });
    expect(
      (
        await publicClient().auth.signInWithPassword({
          email,
          password: "123456",
        })
      ).error,
    ).toBeTruthy();
    checked(
      (await member.auth.signInWithPassword({ email, password: "654321" }))
        .error,
    );
    await m.getByRole("button", { name: "开始新设计" }).click();
    await m
      .getByLabel("上传素材", { exact: true })
      .setInputFiles("public/sample-product.png");
    await expect(m.getByText("素材已上传，可以继续选择模板")).toBeVisible();
    const asset = await db
      .from("nova_assets")
      .select("path")
      .eq("user_id", id)
      .single();
    checked(asset.error);
    await a.getByRole("button", { name: "刷新数据" }).click();
    await expect(row).toContainText("用户已修改");
    await row.getByRole("button", { name: "管理", exact: true }).click();
    a.once("dialog", (d) => d.accept());
    await a.getByRole("button", { name: "删除成员", exact: true }).click();
    await expect(
      a.getByText("成员已删除，图片已清理，额度账目保留。"),
    ).toBeVisible({ timeout: 30000 });
    await expect(row).toHaveCount(0);
    const deleted = await db
      .from("nova_profiles")
      .select("deleted_at,active")
      .eq("id", id)
      .single();
    expect(deleted.data?.deleted_at).toBeTruthy();
    expect(deleted.data?.active).toBe(false);
    expect(
      (
        await publicClient().auth.signInWithPassword({
          email,
          password: "654321",
        })
      ).error,
    ).toBeTruthy();
    const models = await member.from("nova_models").select("id");
    expect(models.data || []).toHaveLength(0);
    expect(
      (await db.storage.from("nova-private").download(asset.data!.path)).error,
    ).toBeTruthy();
  } finally {
    await ac.close();
    await mc.close();
    if (!id) {
      const found = await service()
        .from("nova_profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      id = found.data?.id || "";
    }
    if (id) await cleanup({ id, email });
    else await service().from("nova_invitations").delete().eq("email", email);
    await cleanup(admin);
  }
});
