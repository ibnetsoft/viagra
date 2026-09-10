import { test, expect } from "@playwright/test";

test("mobile shop spends PV once, persists shipment and explores separate trees", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/app/products");
  await expect(
    page.getByRole("heading", { name: "상품", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "상품 선택 · PV로 구매" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("1,500,000원")).toBeVisible();
  await dialog.getByRole("button", { name: "300,000 PV 결제 확정" }).click();
  await expect(page.getByRole("status")).toContainText("구매가 완료");
  await expect(
    page.getByRole("button", { name: "상품 선택 · PV로 구매" }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.locator(".member-shop-balance strong")).toHaveText("0 PV");
  await page.screenshot({
    path: "test-results/member-shop.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "회원 앱 메뉴" })
    .getByRole("link", { name: "구매·배송" })
    .click();
  await expect(page.locator(".member-order-card")).toHaveCount(2);
  await expect(page.getByText("300,000 PV 결제").first()).toBeVisible();
  await page
    .getByRole("navigation", { name: "회원 앱 메뉴" })
    .getByRole("link", { name: "조직도" })
    .click();
  await expect(page.locator(".member-org-node")).toHaveCount(2);
  await expect(
    page.locator(".member-org-node").getByText("정도윤"),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/member-organization.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "추천 조직도", exact: true }).click();
  await expect(page.locator(".member-org-node")).toHaveCount(1);
  await page.locator(".member-org-node").click();
  await expect(page.locator(".member-org-root")).toContainText("최유진");
  await page.getByRole("button", { name: "이전 단계" }).click();
  await expect(page.locator(".member-org-root")).toContainText("이서연");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/admin");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("nav").getByRole("button", { name: "배송 관리" }).click();
  await expect(
    page.getByText("PV 구매", { exact: true }).first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
