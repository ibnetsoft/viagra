import { test, expect } from "@playwright/test";
test("credit and ship the selected member without leaving member management", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "초기화", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "회원 관리", exact: true })
    .click();
  const row = page.locator("tbody tr").filter({
    has: page.locator(".person").getByText("이서연", { exact: true }),
  });
  await row.getByRole("button", { name: "충전·배송", exact: true }).click();
  const panel = page.getByRole("region", { name: "선택 회원 충전 및 배송" });
  await expect(
    panel.getByRole("heading", { name: "이서연 · 충전 및 배송" }),
  ).toBeVisible();
  await expect(panel.locator("tbody tr")).toHaveCount(1);
  await panel.getByRole("button", { name: "입금 확인 · PV 충전" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("이서연 · VP1002")).toBeVisible();
  await dialog.getByLabel("입금 확인 메모").fill("회원 관리에서 입금 확인");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "PV 충전 확정" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(panel.getByText("500,000 PV", { exact: true })).toBeVisible();
  await expect(panel.locator("tbody tr")).toHaveCount(1);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("vital-partners-demo-v2")!),
  );
  expect(
    stored.members.find((m: { id: string }) => m.id === "demo-1").bonus_limit,
  ).toBe(1500000);
  const memberTab = await page.context().newPage();
  await memberTab.goto("/app/products");
  await memberTab
    .getByRole("button", { name: "상품 선택 · PV로 구매" })
    .click();
  await memberTab.getByRole("button", { name: "300,000 PV 결제 확정" }).click();
  await expect(memberTab.getByRole("status")).toContainText("구매가 완료");
  await memberTab.close();
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "회원 관리", exact: true })
    .click();
  await page
    .locator("tbody tr")
    .filter({
      has: page.locator(".person").getByText("이서연", { exact: true }),
    })
    .getByRole("button", { name: "충전·배송", exact: true })
    .click();
  await expect(panel.locator("tbody tr")).toHaveCount(2);
  const pending = panel.locator("tbody tr").filter({ hasText: "미배송" });
  await expect(pending).toHaveCount(1);
  await pending.getByRole("button", { name: "배송 처리" }).click();
  await dialog
    .getByRole("combobox", { name: "배송 상태", exact: true })
    .selectOption("delivered");
  await dialog.getByLabel("택배사 / 운송장 번호 (선택)").fill("택배 456789");
  await dialog.getByRole("button", { name: "배송 상태 저장" }).click();
  await expect(
    panel.locator("tbody tr").filter({ hasText: "미배송" }),
  ).toHaveCount(0);
  await expect(panel.getByText("택배 456789")).toBeVisible();
  await expect(
    page.locator("nav").getByRole("button", { name: "회원 관리", exact: true }),
  ).toHaveClass(/active/);
  await page.getByRole("button", { name: "회원 처리 패널 닫기" }).click();
  await page
    .locator("tbody tr")
    .filter({
      has: page.locator(".person").getByText("박지훈", { exact: true }),
    })
    .getByRole("button", { name: "충전·배송", exact: true })
    .click();
  await expect(
    panel
      .locator(".member-service-summary")
      .getByText("300,000 PV", { exact: true }),
  ).toBeVisible();
  await expect(panel.locator("tbody tr")).toHaveCount(1);
});
