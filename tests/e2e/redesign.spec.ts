import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixture, cleanup, service, checked } from "../helpers";
let member: Awaited<ReturnType<typeof fixture>>,
  other: Awaited<ReturnType<typeof fixture>>;
test.beforeAll(async () => {
  member = await fixture();
  other = await fixture();
});
test.afterAll(async () => {
  if (member) await cleanup(member);
  if (other) await cleanup(other);
});
test("editorial studio, mobile, generation and permanent gallery removal", async ({
  page,
}) => {
  const faults: string[] = [];
  page.on("pageerror", (e) => faults.push(e.message));
  let calls = 0;
  const image = await readFile("public/sample-product.png");
  await page.route(
    "https://ark.cn-beijing.volces.com/api/v3/images/generations",
    async (route) => {
      calls++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ b64_json: image.toString("base64") }],
        }),
      });
    },
  );
  await page.goto("/login/");
  await page.screenshot({ path: ".nova/redesign-login.png", fullPage: true });
  await page.getByLabel("邮箱", { exact: true }).fill(member.email);
  await page.getByLabel("密码", { exact: true }).fill(member.password);
  await page.getByRole("button", { name: "进入工作台" }).click();
  await expect(
    page.getByRole("heading", { name: /让想法.*有点看头/ }),
  ).toBeVisible();
  await page.screenshot({ path: ".nova/redesign-home.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".nova/redesign-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "开始创作", exact: true }).click();
  await page
    .getByLabel("上传素材", { exact: true })
    .setInputFiles("public/sample-product.png");
  await expect(page.getByText("素材已上传，可以继续选择模板")).toBeVisible();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.screenshot({
    path: ".nova/redesign-templates.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByLabel("主标题", { exact: false }).fill("新版作品删除验证");
  await page.screenshot({ path: ".nova/redesign-copy.png", fullPage: true });
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "生成海报", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "下载海报", exact: true }),
  ).toBeVisible({ timeout: 45000 });
  expect(calls).toBe(1);
  const db = service();
  const result = await db
    .from("nova_jobs")
    .select("*")
    .eq("user_id", member.id)
    .single();
  checked(result.error);
  const id = result.data.id,
    output = result.data.output_path;
  const before = await db
    .from("nova_profiles")
    .select("credits")
    .eq("id", member.id)
    .single();
  const forbidden = await other.client.rpc("nova_delete_work", { p_id: id });
  expect(forbidden.error).toBeTruthy();
  await page.getByRole("button", { name: "查看我的作品", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "删除作品：新版作品删除验证" }),
  ).toBeVisible();
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "删除作品：新版作品删除验证" })
    .click();
  await expect(
    page.getByRole("button", { name: "打开作品：新版作品删除验证" }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "删除作品：新版作品删除验证" })
    .click();
  await expect(page.getByText("作品已删除", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "打开作品：新版作品删除验证" }),
  ).toHaveCount(0);
  const deleted = await db
    .from("nova_jobs")
    .select("deleted_at,output_path")
    .eq("id", id)
    .single();
  expect(deleted.data?.deleted_at).toBeTruthy();
  expect(deleted.data?.output_path).toBeNull();
  const after = await db
    .from("nova_profiles")
    .select("credits")
    .eq("id", member.id)
    .single();
  expect(after.data?.credits).toBe(before.data?.credits);
  expect(
    (await db.storage.from("nova-private").download(output)).error,
  ).toBeTruthy();
  checked((await member.client.rpc("nova_delete_work", { p_id: id })).error);
  await page.reload();
  await page.getByRole("button", { name: "我的作品", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "打开作品：新版作品删除验证" }),
  ).toHaveCount(0);
  expect(faults).toEqual([]);
});

test("admin and small-screen creation remain usable", async ({ page }) => {
  const admin = await fixture("admin");
  try {
    await page.goto("/login/?next=/admin");
    await page.getByLabel("邮箱", { exact: true }).fill(admin.email);
    await page.getByLabel("密码", { exact: true }).fill(admin.password);
    await page.getByRole("button", { name: "进入工作台" }).click();
    await expect(page.getByRole("heading", { name: "概览。" })).toBeVisible();
    await page.screenshot({ path: ".nova/redesign-admin.png", fullPage: true });
    await page.getByRole("button", { name: "模型配置", exact: true }).click();
    await expect(page.getByLabel("供应商名称")).toBeVisible();
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /让想法.*有点看头/ }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: ".nova/redesign-mobile-final.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "开始创作", exact: true }).click();
    await page
      .getByLabel("上传素材", { exact: true })
      .setInputFiles("public/sample-product.png");
    await expect(page.getByText("素材已上传，可以继续选择模板")).toBeVisible();
    for (let n = 0; n < 3; n++) {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await page.getByRole("button", { name: "下一步", exact: true }).click();
    }
    await expect(
      page.getByText("你的专属提示词", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: ".nova/redesign-mobile-confirm.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "上一步", exact: true }).click();
    await expect(page.getByLabel("主标题", { exact: false })).toBeVisible();
  } finally {
    await cleanup(admin);
  }
});
