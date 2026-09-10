import { test, expect } from "@playwright/test";
test("signup requires bank details and saved member bank is visible to admin", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByRole("button", { name: "처음이신가요? 회원가입" }).click();
  for (const name of ["국내은행", "계좌번호", "예금주"])
    await expect(
      page.getByRole(name === "국내은행" ? "combobox" : "textbox", {
        name,
        exact: true,
      }),
    ).toHaveAttribute("required", "");
  await page.goto("/app/profile");
  await page.getByRole("button", { name: "계좌 등록", exact: true }).click();
  await page
    .getByRole("combobox", { name: "국내은행", exact: true })
    .selectOption("KB국민은행");
  await page.getByLabel("계좌번호", { exact: true }).fill("001-234-567890");
  await page.getByLabel("예금주", { exact: true }).fill("테스트 예금주");
  await page.getByRole("button", { name: "계좌 정보 저장" }).click();
  await expect(page.getByText("001234567890", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("테스트 예금주", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/admin");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator("nav")
    .getByRole("button", { name: "회원 관리", exact: true })
    .click();
  await page
    .locator("tbody tr")
    .filter({
      has: page.locator(".person").getByText("이서연", { exact: true }),
    })
    .getByRole("button", { name: "정보 수정" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("계좌번호", { exact: true })).toHaveValue(
    "001234567890",
  );
  await dialog.getByLabel("예금주", { exact: true }).fill("관리자 확인");
  await dialog.getByRole("button", { name: "회원 정보 저장" }).click();
  await page.goto("/app/profile");
  await expect(page.getByText("관리자 확인", { exact: true })).toBeVisible();
});
