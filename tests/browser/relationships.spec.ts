import { test, expect } from "@playwright/test";
test("admin can edit purchased member referrer and sponsor", async ({
  page,
}) => {
  await page.goto("/admin");
  await page
    .locator("nav")
    .getByRole("button", { name: "회원 관리", exact: true })
    .click();
  const row = page
    .locator("tbody tr")
    .filter({
      has: page.locator(".person").getByText("이서연", { exact: true }),
    });
  await row.getByRole("button", { name: "정보 수정" }).click();
  const dialog = page.getByRole("dialog");
  const ref = dialog.getByRole("combobox", { name: "추천인", exact: true }),
    sponsor = dialog.getByRole("combobox", {
      name: "후원 배치 상위 회원",
      exact: true,
    });
  await expect(ref).toBeEnabled();
  await expect(sponsor).toBeEnabled();
  await ref.selectOption("demo-2");
  await sponsor.selectOption("demo-5");
  await dialog
    .getByRole("combobox", { name: "후원 위치", exact: true })
    .selectOption("R");
  await dialog.getByRole("button", { name: "회원 정보 저장" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "회원 관리", exact: true })
    .click();
  await row.getByRole("button", { name: "정보 수정" }).click();
  await expect(ref).toHaveValue("demo-2");
  await expect(sponsor).toHaveValue("demo-5");
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("vital-partners-demo-v2")!),
  );
  expect(
    state.members.find((m: { id: string }) => m.id === "demo-3").sponsor_id,
  ).toBe("demo-1");
});
