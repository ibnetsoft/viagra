import { test, expect } from "@playwright/test";
test("admin is absent from member rows, network roots and assignment choices", async ({
  page,
}) => {
  await page.goto("/admin");
  const nav = page.locator("nav");
  await nav.getByRole("button", { name: "회원 관리", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(7);
  await expect(page.locator("tbody")).not.toContainText("운영 관리자");
  await page
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: "정보 수정" })
    .click();
  await expect(
    page.getByRole("dialog").locator("select[name=referrer_id]"),
  ).not.toContainText("운영 관리자");
  await expect(
    page.getByRole("dialog").locator("select[name=sponsor_id]"),
  ).not.toContainText("운영 관리자");
  await page.keyboard.press("Escape");
  await nav.getByRole("button", { name: "조직도", exact: true }).click();
  for (const mode of ["후원 배치도", "추천 관계도"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await expect(
      page
        .getByRole("combobox", { name: "조직도 기준 회원" })
        .locator("option"),
    ).toHaveCount(7);
    await expect(
      page.getByRole("combobox", { name: "조직도 기준 회원" }),
    ).not.toContainText("운영 관리자");
    await expect(page.locator(".tree-canvas")).not.toContainText("운영 관리자");
    await expect(page.locator(".root-node")).toContainText("김민준");
  }
  await nav.getByRole("button", { name: "운영 설정", exact: true }).click();
  await expect(page.locator("select[name=owner]")).not.toContainText(
    "운영 관리자",
  );
  await page.getByRole("button", { name: "수동 충전", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "충전할 회원" }),
  ).not.toContainText("운영 관리자");
});
