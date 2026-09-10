import { test, expect } from "@playwright/test";
test("admin preview, targeted delivery and mobile read badge persist", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.locator("nav").getByRole("button", { name: "공지 관리" }).click();
  await page.getByRole("button", { name: "새 공지 작성" }).click();
  await page.getByLabel("제목", { exact: true }).fill("테스트 공지");
  await page
    .getByLabel("내용", { exact: true })
    .fill("<script>window.bad=1</script>\n공지 두 번째 줄");
  await page.getByLabel("수신 대상", { exact: true }).selectOption("selected");
  await page.getByRole("checkbox", { name: /이서연/ }).check();
  await page.getByRole("button", { name: "임시 저장", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "아직 발송되지 않았습니다",
  );
  await page.goto("/app/notifications");
  await expect(page.getByText("도착한 공지가 없습니다.")).toBeVisible();
  await page.goto("/admin");
  await page.locator("nav").getByRole("button", { name: "공지 관리" }).click();
  await page.getByRole("button", { name: "계속 작성" }).click();
  await page.getByRole("button", { name: "저장하고 발송 미리보기" }).click();
  await expect(
    page.getByRole("heading", { name: "발송 전 확인" }),
  ).toBeVisible();
  await expect(page.getByText("수신: 선택한 회원 1명")).toBeVisible();
  await page.getByRole("button", { name: "발송 확정" }).click();
  await expect(page.getByRole("status")).toContainText("1명에게 앱 공지");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  await page.getByRole("link", { name: "알림함 · 읽지 않은 알림 1개" }).click();
  await page.getByRole("button", { name: "테스트 공지", exact: true }).click();
  await expect(page.getByText("읽지 않은 공지 0개")).toBeVisible();
  await expect(
    page.getByText("<script>window.bad=1</script>", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "테스트 공지" }),
  ).toHaveAttribute("aria-expanded", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/member-notifications.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByText("읽지 않은 공지 0개")).toBeVisible();
  const worker = await page.request.get("/app/sw.js");
  expect(worker.status()).toBe(200);
  expect(worker.headers()["cache-control"]).toContain("no-store");
  expect((await page.request.post("/api/push/dispatch")).status()).toBe(401);
});
