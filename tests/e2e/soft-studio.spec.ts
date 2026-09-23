import { test, expect } from "@playwright/test";
import { fixture, cleanup, service, checked } from "../helpers";
test("soft studio carousel, separate filters and quota notice", async ({
  page,
}) => {
  const user = await fixture();
  try {
    await page.goto("/login/");
    await page.getByLabel("邮箱", { exact: true }).fill(user.email);
    await page.getByLabel("密码", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "进入工作台" }).click();
    await expect(
      page.getByRole("button", { name: "切换到生活写真" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: ".nova/soft-home.png", fullPage: true });
    await expect(
      page.getByRole("button", { name: "切换到讲师介绍" }),
    ).toHaveAttribute("aria-pressed", "true", { timeout: 10000 });
    await expect(
      page.getByRole("button", { name: "切换到个人 IP" }),
    ).toHaveAttribute("aria-pressed", "true", { timeout: 10000 });
    await page.getByRole("button", { name: "暂停轮播" }).click();
    await page.getByRole("button", { name: "切换到生活写真" }).click();
    await page.getByRole("button", { name: "灵感模板", exact: true }).click();
    await expect(page.locator(".filter-tabs button.active")).toHaveText("全部");
    await expect(page.locator(".template-card")).toHaveCount(9);
    await page.getByRole("button", { name: "产品", exact: true }).click();
    await page.getByRole("button", { name: "开始新设计" }).click();
    await page.screenshot({ path: ".nova/soft-upload.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: ".nova/soft-upload-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page
      .getByLabel("上传素材", { exact: true })
      .setInputFiles("public/sample-product.png");
    await expect(page.getByText("素材已上传，可以继续选择模板")).toBeVisible();
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await expect(page.locator(".filter-tabs button.active")).toContainText(
      "人物",
    );
    await expect(page.locator(".template-card")).toHaveCount(3);
    await page.getByRole("button", { name: "灵感模板", exact: true }).click();
    await expect(page.locator(".filter-tabs button.active")).toHaveText("全部");
    checked(
      (
        await service()
          .from("nova_profiles")
          .update({ credits: 0 })
          .eq("id", user.id)
      ).error,
    );
    await page.reload();
    await expect(
      page.getByText(
        "创作额度已用完，请联系管理员－生姜，追加额度后即可继续创作。",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "切换到生活写真" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({
      path: ".nova/soft-home-mobile.png",
      fullPage: true,
    });
  } finally {
    await cleanup(user);
  }
});
