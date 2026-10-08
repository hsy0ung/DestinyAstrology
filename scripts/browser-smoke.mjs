import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const base = process.env.ASTRO_TEST_BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ executablePath: process.env.ASTRO_BROWSER_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
let created = false;
try {
  await page.goto(base);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("사주와 점성술로");
  await expect(page.locator(".connection-note")).toBeVisible();
  await page.screenshot({ path: "/workspace/scratch/destiny-desktop.png", fullPage: true });
  await page.locator(".header-profile").click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toHaveText("회원가입");
  await dialog.locator('input[name="name"]').fill("검증 사용자");
  await dialog.locator('input[name="email"]').fill(`browser-${randomUUID()}@example.invalid`);
  await dialog.locator('input[name="password"]').fill(randomUUID());
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "무료로 시작하기", exact: true }).click();
  await expect(dialog.getByRole("heading")).toHaveText("출생 정보 입력");
  created = true;
  await dialog.locator('input[name="birthDate"]').fill("1995-08-11");
  const period = dialog.getByRole("combobox", { name: "출생 시간 오전·오후", exact: true });
  const hour = dialog.getByRole("combobox", { name: "출생 시간 시", exact: true });
  const minute = dialog.getByRole("combobox", { name: "출생 시간 분", exact: true });
  const hiddenTime = dialog.locator('input[type="hidden"][name="birthTime"]');
  const region = dialog.getByRole("combobox", { name: "출생 지역", exact: true });
  const unknownTime = dialog.getByRole("checkbox", { name: "출생 시간을 모릅니다.", exact: true });
  const koreaRegions = [
    "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시", "세종특별자치시",
    "경기도", "강원특별자치도", "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
  ];
  await expect(region.locator("optgroup")).toHaveCount(18);
  const actualRegions = await region.locator("optgroup").evaluateAll(groups => groups.map(group => group.label));
  expect(actualRegions).toEqual(expect.arrayContaining([...koreaRegions, "해외"]));
  for (const name of koreaRegions) {
    expect(await region.locator(`optgroup[label="${name}"] option`).count()).toBeGreaterThan(0);
  }
  await expect(region.locator('option[value="울산"]')).toHaveText("울산광역시");
  await expect(region.locator('option[value="세종"]')).toHaveText("세종특별자치시");
  await expect(hour).toHaveValue("");
  await expect(hour).toHaveAttribute("required", "");
  await expect(minute).toHaveValue("00");
  await expect(hiddenTime).toHaveValue("");
  await period.focus();
  await period.press("End");
  await expect(period).toHaveValue("pm");
  await period.press("Home");
  await expect(period).toHaveValue("am");

  async function selectTime(periodValue, hourValue, minuteValue, expectedTime) {
    await period.selectOption(periodValue);
    await hour.selectOption(hourValue);
    await minute.selectOption(minuteValue);
    await expect(hiddenTime).toHaveValue(expectedTime);
  }
  async function saveProfile(expectedTime, expectedCity) {
    await dialog.getByRole("checkbox", { name: /출생 정보와 대화 내용/ }).check();
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === "/api/profile" && response.request().method() === "POST"),
      dialog.getByRole("button", { name: "출생 정보 저장", exact: true }).click(),
    ]);
    expect(response.status()).toBe(200);
    const saved = (await response.json()).profile;
    expect(saved.birthTime).toBe(expectedTime);
    expect(saved.city).toBe(expectedCity);
    expect(saved.timezone).toBe("Asia/Seoul");
    await expect(dialog).not.toBeVisible();
  }
  async function reopenProfile() {
    await page.locator(".header-profile").click();
    await expect(dialog.getByRole("heading")).toHaveText("출생 정보 입력");
  }
  async function reloadAndReopenProfile() {
    await page.reload();
    await expect(page.locator(".header-profile")).toContainText("검증 사용자");
    await reopenProfile();
  }
  async function expectTime(periodValue, hourValue, minuteValue, expectedTime) {
    await expect(period).toHaveValue(periodValue);
    await expect(hour).toHaveValue(hourValue);
    await expect(minute).toHaveValue(minuteValue);
    await expect(hiddenTime).toHaveValue(expectedTime);
  }

  // Use the real form and API for midnight, noon, and afternoon persistence.
  for (const scenario of [
    { period: "am", hour: "12", minute: "00", time: "00:00", city: "울산", label: "울산광역시" },
    { period: "pm", hour: "12", minute: "00", time: "12:00", city: "세종", label: "세종특별자치시" },
    { period: "pm", hour: "2", minute: "35", time: "14:35", city: "울산", label: "울산광역시" },
  ]) {
    await selectTime(scenario.period, scenario.hour, scenario.minute, scenario.time);
    await region.selectOption({ label: scenario.label });
    await saveProfile(scenario.time, scenario.city);
    await reopenProfile();
    await expectTime(scenario.period, scenario.hour, scenario.minute, scenario.time);
    await expect(region).toHaveValue(scenario.city);
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
    await reloadAndReopenProfile();
    await expectTime(scenario.period, scenario.hour, scenario.minute, scenario.time);
    await expect(region).toHaveValue(scenario.city);
  }
  await unknownTime.check();
  for (const control of [period, hour, minute]) {
    await expect(control).toBeDisabled();
    expect(await control.getAttribute("required")).toBeNull();
  }
  await expect(hiddenTime).toHaveValue("");
  await unknownTime.uncheck();
  await expectTime("pm", "2", "35", "14:35");
  await unknownTime.check();
  await region.selectOption({ label: "세종특별자치시" });
  await saveProfile(null, "세종");
  await reloadAndReopenProfile();
  await expect(unknownTime).toBeChecked();
  await expect(period).toBeDisabled();
  await expect(hiddenTime).toHaveValue("");
  await expect(region).toHaveValue("세종");

  // Repeat the corrected controls and persistence at the phone viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await unknownTime.uncheck();
  await selectTime("pm", "2", "35", "14:35");
  await saveProfile("14:35", "세종");
  await reloadAndReopenProfile();
  await expectTime("pm", "2", "35", "14:35");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await selectTime("am", "9", "15", "09:15");
  await region.selectOption({ label: "서울특별시" });
  await saveProfile("09:15", "서울");
  await page.setViewportSize({ width: 1440, height: 960 });
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
  await expect(dialog.getByRole("heading")).toHaveText("대화 이용권 구매");
  await expect(dialog).toContainText("카카오페이");
  await expect(dialog).toContainText("토스페이");
  await expect(dialog).toContainText("신용·체크카드");
  await expect(dialog.getByRole("button", { name: "결제 서비스 준비 중", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await expect(page.locator(".mobile-sidebar")).toBeVisible();
  await page.locator(".mobile-sidebar .new-chat-button").click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("사주와 점성술로");
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
    await dialog.getByRole("button", { name: "대화 이용권 5회 구매", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "대화 이용권 5회 구매", exact: true })).toBeEnabled();
    const called = await page.evaluate(() => window.paymentRequests.at(-1));
    expect(called.method).toBe("CARD");
    expect(called.amount).toEqual({ currency: "KRW", value: 5000 });
    expect(called.card.flowMode).toBe(easyPay ? "DIRECT" : "DEFAULT");
    if (easyPay) expect(called.card.easyPay).toBe(easyPay);
  }
  expect(errors).toEqual([]);
  console.log("Browser smoke passed: real signup, AM/PM midnight/noon/afternoon and unknown-time persistence, 17 Korean regions, profile/chat/thread/quota/delete, mobile input/drawer, and mocked TossPay/KakaoPay/card SDK dispatch. No real payment made.");
} finally {
  if (created) await context.request.delete(base + "/api/account", { headers: { Origin: base }, data: { confirmation: "DELETE" } });
  await browser.close();
}
