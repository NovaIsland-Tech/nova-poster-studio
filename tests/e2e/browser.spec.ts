import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { fixture, cleanup, service, checked } from "../helpers";
let admin: Awaited<ReturnType<typeof fixture>>,
  member: Awaited<ReturnType<typeof fixture>>;
const endpoint = "https://api.openai.com/v1/images/edits";
let modelId = "";
async function login(page: Page, user: typeof admin, next = "") {
  await page.goto("/login/" + next);
  await page.getByLabel("邮箱", { exact: true }).fill(user.email);
  await page.getByLabel("密码", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "进入工作台" }).click();
}
test.describe.serial("pure static site, real Supabase, mocked model", () => {
  test.beforeAll(async () => {
    const live = await service()
      .from("nova_models")
      .select("id")
      .eq("enabled", true);
    expect(live.data).toHaveLength(0);
    admin = await fixture("admin");
    member = await fixture();
  });
  test.afterAll(async () => {
    if (member) await cleanup(member);
    if (admin) await cleanup(admin);
    if (modelId)
      checked(
        (await service().from("nova_models").delete().eq("id", modelId)).error,
      );
  });
  test("admin config and browser CORS probe", async ({ page }) => {
    let probes = 0;
    await page.route(endpoint, async (route) => {
      probes++;
      expect(route.request().headers().authorization).toBe(
        "Bearer qa-key-browser-only",
      );
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ error: { message: "Missing model" } }),
      });
    });
    await login(page, admin, "?next=/admin");
    await expect(page.getByRole("heading", { name: "概览。" })).toBeVisible();
    await page.getByRole("button", { name: "模型配置", exact: true }).click();
    await page.getByLabel("供应商名称").fill("QA browser model");
    await page.getByLabel("模型名称 / 推理接入点 ID").fill("test-model");
    await page
      .getByLabel("API Key", { exact: false })
      .fill("qa-key-browser-only");
    await page.getByRole("button", { name: "保存配置", exact: true }).click();
    await expect(
      page.getByText(
        "模型配置已保存到数据库。请到创作工作台完成一次真实生成测试。",
      ),
    ).toBeVisible();
    const model = await service()
      .from("nova_models")
      .select("id")
      .eq("provider", "QA browser model")
      .single();
    checked(model.error);
    modelId = model.data!.id;
    await page.getByRole("button", { name: "浏览器直连测试" }).click();
    await expect(page.getByText(/浏览器已读到 HTTP 400/)).toBeVisible();
    expect(probes).toBe(1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: ".nova/qa-browser-admin.png",
      fullPage: true,
    });
  });
  test("member upload, canvas poster, save, download and no application API", async ({
    page,
  }) => {
    let calls = 0;
    const localApis: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("localhost:3000/api/")) localApis.push(r.url());
    });
    const image = await readFile("public/sample-product.png");
    await page.route(endpoint, async (route) => {
      calls++;
      expect(route.request().postDataBuffer()!.toString()).toContain(
        "reference.png",
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          data: [{ b64_json: image.toString("base64") }],
        }),
      });
    });
    await login(page, member);
    await expect(
      page.getByRole("heading", { name: /让想法.*有点看头/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "开始创作", exact: true }).click();
    await page
      .getByLabel("上传素材", { exact: true })
      .setInputFiles("public/sample-product.png");
    await expect(page.getByText("素材已上传，可以继续选择模板")).toBeVisible();
    await page.getByRole("button", { name: "下一步" }).click();
    await page.getByRole("button", { name: "下一步" }).click();
    await page.getByLabel("主标题", { exact: false }).fill("纯前端测试");
    await page.getByRole("button", { name: "下一步" }).click();
    await page.getByRole("button", { name: "生成海报", exact: true }).click();
    const download = page.getByRole("button", {
      name: "下载海报",
      exact: true,
    });
    await expect(download).toBeVisible({ timeout: 45_000 });
    expect(calls).toBe(1);
    expect(localApis).toEqual([]);
    const promise = page.waitForEvent("download");
    await download.click();
    const file = await promise;
    const path = await file.path();
    const metadata = await sharp(path!).metadata();
    expect([metadata.width, metadata.height]).toEqual([1200, 1600]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: ".nova/qa-browser-result.png",
      fullPage: true,
    });
    await page.reload();
    await expect(download).toBeVisible();
    expect(calls).toBe(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: ".nova/qa-browser-mobile.png",
      fullPage: true,
    });
    await page.goto("/admin/");
    await expect(page.getByText("仅管理员可进入管理后台")).toBeVisible();
  });
  test("CORS failure is visible and reload never repeats a paid call", async ({
    page,
  }) => {
    let calls = 0;
    await page.route(endpoint, (route) => {
      calls++;
      return route.abort("failed");
    });
    await login(page, member);
    await expect(
      page.getByRole("heading", { name: /让想法.*有点看头/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "开始创作", exact: true }).click();
    await page
      .getByLabel("上传素材", { exact: true })
      .setInputFiles("public/sample-product.png");
    await expect(page.getByText("素材已上传，可以继续选择模板")).toBeVisible();
    for (let i = 0; i < 3; i++)
      await page.getByRole("button", { name: "下一步" }).click();
    await page.getByRole("button", { name: "生成海报", exact: true }).click();
    await expect(page.getByText(/浏览器无法读取接口响应/)).toBeVisible({
      timeout: 45_000,
    });
    expect(calls).toBe(1);
    await page.reload();
    await expect(page.getByText(/浏览器无法读取接口响应/)).toBeVisible();
    expect(calls).toBe(1);
  });
});
