import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.ASTRO_TEST_BASE_URL || "http://127.0.0.1:3000";
let cookie = "";
let created = false;
async function request(path, body, method) {
  const res = await fetch(base + path, {
    method: method || (body ? "POST" : "GET"),
    headers: { ...(body ? { "Content-Type": "application/json", Origin: base } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.headers.has("set-cookie")) cookie = res.headers.get("set-cookie").split(";")[0];
  return { status: res.status, data: await res.json() };
}

try {
  const state = await request("/api/session");
  assert.equal(state.status, 200);
  assert.equal(state.data.user, null);
  assert.equal(state.data.config.aiAvailable, false, "Run this smoke test in demo mode; it never calls a paid AI provider.");
  assert.equal((await request("/api/chat", { question: "일에서 원하는 방향을 정하고 싶어요.", mode: "standard", requestId: randomUUID() })).status, 401);
  const email = `smoke-${randomUUID()}@example.invalid`;
  const registered = await request("/api/auth", { action: "register", name: "검증 계정", email, password: randomUUID(), consent: true });
  assert.equal(registered.status, 200);
  created = true;
  assert.equal(registered.data.usage.freeRemaining, 3);
  assert.equal((await request("/api/chat", { question: "일에서 원하는 방향을 정하고 싶어요.", mode: "standard", requestId: randomUUID() })).status, 400);
  const profiled = await request("/api/profile", { consent: true, profile: { name: "검증 사용자", birthDate: "1995-08-11", birthTime: "09:15", city: "서울", timezone: "Asia/Seoul", latitude: 37.5665, longitude: 126.978 } });
  assert.equal(profiled.status, 200);
  assert.equal((await request("/api/chat", { question: "심화 해석으로 일의 방향을 구체화하고 싶어요.", mode: "deep", requestId: randomUUID() })).status, 402);
  const firstRequest = { question: "직장에서 제 강점을 살릴 다음 행동을 알고 싶어요.", mode: "standard", requestId: randomUUID(), parentId: null };
  const first = await request("/api/chat", firstRequest);
  assert.equal(first.status, 200);
  assert.equal(first.data.usage.freeRemaining, 2);
  assert.equal(first.data.conversation.source, "demo");
  assert.equal(first.data.conversation.chart.sun.sign, "사자자리");
  assert.ok(first.data.conversation.answer.actions.length >= 2);
  const retry = await request("/api/chat", firstRequest);
  assert.equal(retry.status, 200);
  assert.equal(retry.data.conversation.id, first.data.conversation.id);
  assert.equal(retry.data.usage.freeRemaining, 2);
  const followup = await request("/api/chat", { question: "사람들과 협력하는 일이 즐거워요. 이번 주에는 무엇을 해 볼까요?", mode: "standard", requestId: randomUUID(), parentId: first.data.conversation.id });
  assert.equal(followup.status, 200);
  assert.equal(followup.data.conversation.parentId, first.data.conversation.id);
  assert.equal(followup.data.usage.freeRemaining, 1);
  assert.equal((await request("/api/chat", { question: "새로운 관계에서 제 성향을 이해하고 싶어요.", mode: "standard", requestId: randomUUID() })).status, 200);
  assert.equal((await request("/api/chat", { question: "오늘 추가로 어떤 행동을 해 볼까요?", mode: "standard", requestId: randomUUID() })).status, 402);
  const final = await request("/api/session");
  assert.equal(final.data.conversations.length, 3);
  assert.equal(final.data.usage.freeRemaining, 0);
  assert.equal(final.data.usage.paidRemaining, 0);
  assert.equal((await request("/api/orders", {})).status, 503);
  assert.equal((await request("/api/account", { confirmation: "DELETE" }, "DELETE")).status, 200);
  created = false;
  assert.equal((await request("/api/session")).data.user, null);
  console.log("HTTP smoke passed: signup → profile → chart + answer → follow-up → 3/day quota → idempotent retry → unavailable checkout → account deletion.");
} finally {
  if (created) await request("/api/account", { confirmation: "DELETE" }, "DELETE");
}
