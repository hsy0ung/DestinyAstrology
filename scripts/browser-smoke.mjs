import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const base = process.env.ASTRO_TEST_BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ executablePath: process.env.ASTRO_BROWSER_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
let created = false;
try {
  await page.goto(base);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("복잡한 마음");
  await expect(page.locator(".connection-note")).toBeVisible();
  await page.screenshot({ path: "/workspace/scratch/destiny-desktop.png", fullPage: true });
  await page.locator(".header-profile").click();
  let dialog = page.getByRole("dialog");
  await dialog.locator('input[name="name"]').fill("검증 사용자");
  await dialog.locator('input[name="email"]').fill(`browser-${randomUUID()}@example.invalid`);
  await dialog.locator('input[name="password"]').fill(randomUUID());
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "무료로 시작하기", exact: true }).click();
  await expect(dialog.getByRole("heading")).toHaveText("당신이 태어난 순간");
  created = true;
  await dialog.locator('input[name="birthDate"]').fill("1995-08-11");
  await dialog.locator('input[name="birthTime"]').fill("09:15");
  await dialog.locator('select[name="city"]').selectOption("서울");
  await dialog.getByRole("checkbox", { name: /출생 정보와 대화 내용/ }).check();
  await dialog.getByRole("button", { name: "내 별결 저장하기" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel("고민 입력").fill("직장에서 제 강점을 살릴 다음 행동을 알려 주세요.");
  await page.getByRole("button", { name: "고민 보내기" }).click();
  await expect(page.locator(".conversation-exchange")).toHaveCount(1);
  await expect(page.locator(".sample-label")).toContainText("예시 답변");
  await expect(page.locator(".chart-facts")).toContainText("사자자리");
  await page.getByLabel("고민 입력").fill("협력하는 업무가 즐거워요. 이번 주에는 무엇을 해 볼까요?");
  await page.getByRole("button", { name: "고민 보내기" }).click();
  await expect(page.locator(".conversation-exchange")).toHaveCount(2);
  await expect(page.locator(".desktop-sidebar .conversation-item")).toHaveCount(1);
  await page.locator(".desktop-sidebar .new-chat-button").click();
  await page.getByLabel("고민 입력").fill("새로운 관계에서 제 성향을 이해하고 싶어요.");
  await page.getByRole("button", { name: "고민 보내기" }).click();
  await expect(page.locator(".conversation-exchange")).toHaveCount(1);
  await expect(page.locator(".desktop-sidebar .conversation-item")).toHaveCount(2);
  await page.getByLabel("고민 입력").fill("오늘 추가로 어떤 행동을 해 볼까요?");
  await page.getByRole("button", { name: "고민 보내기" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("카카오페이");
  await expect(dialog).toContainText("토스페이");
  await expect(dialog).toContainText("신용·체크카드");
  await expect(dialog.getByRole("button", { name: "결제 서비스 준비 중", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await expect(page.locator(".mobile-sidebar")).toBeVisible();
  await page.locator(".mobile-sidebar .new-chat-button").click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("복잡한 마음");
  await page.screenshot({ path: "/workspace/scratch/destiny-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await page.locator(".mobile-sidebar .sidebar-account").click();
  await dialog.getByRole("button", { name: "계정과 모든 기록 삭제" }).click();
  await dialog.getByPlaceholder("삭제", { exact: true }).fill("삭제");
  await dialog.getByRole("button", { name: "계정과 기록 영구 삭제", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  created = false;

  // Mock only the payment boundary: no checkout/charge or credits are actually created.
  await page.route("**/api/session", async route => {
    const actual = await route.fetch();
    const session = await actual.json();
    session.user = { id: randomUUID(), name: "결제 화면 검증", email: "payment@example.invalid" };
    session.config.paymentAvailable = true;
    session.config.aiAvailable = true;
    session.usage.resetsAt = new Date(Date.now() + 3_600_000).toISOString();
    await route.fulfill({ json: session });
  });
  await page.route("**/api/orders", route => route.fulfill({ json: { orderId: randomUUID(), amount: 5000, orderName: "대화 5회", clientKey: "test-public-key", customerKey: randomUUID() } }));
  await page.reload();
  await page.evaluate(() => {
    window.paymentRequests = [];
    window.TossPayments = () => ({ payment: () => ({ requestPayment: async options => { window.paymentRequests.push(options); } }) });
  });
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await page.locator(".mobile-sidebar .credit-card > button").click();
  for (const [label, easyPay] of [["토스페이", "토스페이"], ["카카오페이", "카카오페이"], ["신용·체크카드", null]]) {
    await dialog.getByRole("button", { name: new RegExp(label) }).click();
    await dialog.getByRole("button", { name: "대화 5회 충전하기", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "대화 5회 충전하기", exact: true })).toBeEnabled();
    const called = await page.evaluate(() => window.paymentRequests.at(-1));
    expect(called.method).toBe("CARD");
    expect(called.amount).toEqual({ currency: "KRW", value: 5000 });
    expect(called.card.flowMode).toBe(easyPay ? "DIRECT" : "DEFAULT");
    if (easyPay) expect(called.card.easyPay).toBe(easyPay);
  }
  expect(errors).toEqual([]);
  console.log("Browser smoke passed: real signup/profile/chat/thread/quota/delete, mobile drawer, and mocked TossPay/KakaoPay/card SDK dispatch. No real payment made.");
} finally {
  if (created) await context.request.delete(base + "/api/account", { headers: { Origin: base }, data: { confirmation: "DELETE" } });
  await browser.close();
}
