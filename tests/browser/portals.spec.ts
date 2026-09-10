import { test, expect } from "@playwright/test";
test("member app is independent from admin website", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: /이서연님/ })).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "수동 충전" })).toHaveCount(0);
  await expect(page.getByText("김민준")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/member-home.png",
    fullPage: true,
  });
  const nav = page.getByRole("navigation", { name: "회원 앱 메뉴" });
  await nav.getByRole("link", { name: "구매·배송" }).click();
  await expect(page).toHaveURL(/\/app\/orders$/);
  await expect(
    page.getByRole("heading", { name: "구매와 배송" }),
  ).toBeVisible();
  await expect(page.locator(".member-order-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "배송 처리" })).toHaveCount(0);
  await nav.getByRole("link", { name: "내 정보" }).click();
  await expect(page.getByText("member2@example.com")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "내 정보" })).toBeVisible();
  await nav.getByRole("link", { name: "보너스", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "나의 보너스" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const manifest = await page.request.get("/app/manifest.webmanifest");
  expect((await manifest.json()).scope).toBe("/app");
  await page.goto("/admin/login");
  await expect(
    page.getByRole("heading", { name: "관리자 로그인" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /회원가입/ })).toHaveCount(0);
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /회원가입/ })).toBeVisible();
  await page.goto("/admin");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByText("관리자 운영 사이트")).toBeVisible();
  await expect(page.locator(".member-bottom-nav")).toHaveCount(0);
  await expect(page.getByText("MY BONUS LIMIT")).toHaveCount(0);
  await page.locator("nav").getByRole("button", { name: "매출 관리" }).click();
  await page.getByLabel("시작일").fill("2099-01-01");
  await expect(page.getByText("선택한 기간의 구매가 없습니다.")).toBeVisible();
  await page.getByRole("button", { name: "전체 기간" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(7);
  await page.screenshot({
    path: "test-results/admin-sales.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
