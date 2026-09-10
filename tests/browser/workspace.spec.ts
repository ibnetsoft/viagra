import { test, expect } from "@playwright/test";
test("administrator preview: recharge, shipping, membership, persistence and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "운영 현황을 한눈에" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "초기화", exact: true }).click();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "수동 충전", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("충전 시 추가 없음 · 상품 구매 시 150만원"),
  ).toBeVisible();
  await dialog.getByLabel("입금 확인 메모").fill("테스트 입금 확인");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "PV 충전 확정" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.locator(".stat-value").filter({ hasText: "2,860,000" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".stat-value").filter({ hasText: "2,860,000" }),
  ).toBeVisible();
  await page.locator("nav").getByRole("button", { name: "배송 관리" }).click();
  await page.getByRole("button", { name: "미배송", exact: true }).click();
  const row = page.locator("tbody tr").filter({ hasText: "최유진" }).first();
  await row.getByRole("button", { name: "배송 처리" }).click();
  await dialog
    .getByRole("combobox", { name: "배송 상태", exact: true })
    .selectOption("delivered");
  await dialog.getByLabel("택배사 / 운송장 번호 (선택)").fill("테스트 123456");
  await dialog.getByRole("button", { name: "배송 상태 저장" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "배송완료", exact: true }).click();
  await expect(page.getByText("테스트 123456")).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "회원 관리", exact: true })
    .click();
  await page.getByPlaceholder("이름, 회원번호, 연락처 검색").fill("김민준");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page.locator("tbody tr").getByText("센터", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "정보 수정" }).click();
  await dialog.getByLabel("상세 주소").fill("수정된 주소 202호");
  await dialog.getByRole("button", { name: "회원 정보 저장" }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "조직도", exact: true })
    .click();
  await expect(page.locator(".tree-node")).toHaveCount(7);
  await page.getByRole("button", { name: "추천 관계도" }).click();
  await expect(page.locator(".tree-node")).toHaveCount(5);
  await page
    .locator("nav")
    .getByRole("button", { name: "대시보드", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto("/login");
  await page.getByRole("button", { name: "처음이신가요? 회원가입" }).click();
  await expect(page.getByLabel("기본 주소")).toBeVisible();
  await expect(page.getByLabel("우편번호")).toBeVisible();
  await page.screenshot({
    path: "test-results/signup-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
