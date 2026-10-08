import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const directory = mkdtempSync(join(tmpdir(), "destiny-payments-"));
process.env.ASTRO_DB_PATH = join(directory, "test.sqlite");
const originalAuth = process.env.ASTRO_TOSS_AUTH_HEADER;
process.env.ASTRO_TOSS_AUTH_HEADER = "Basic mock-test-credential";
let db: typeof import("../src/lib/db");
let confirmPayment: typeof import("../src/lib/payments").confirmPayment;
before(async () => {
  db = await import("../src/lib/db");
  ({ confirmPayment } = await import("../src/lib/payments"));
});
after(() => {
  db.closeDb();
  if (originalAuth === undefined) delete process.env.ASTRO_TOSS_AUTH_HEADER;
  else process.env.ASTRO_TOSS_AUTH_HEADER = originalAuth;
  rmSync(directory, { recursive: true, force: true });
});

let userNumber = 0;
function account() {
  userNumber += 1;
  return db.createUser({ id: `payment-user-${userNumber}`, email: `payment-${userNumber}@example.com`, name: "결제 테스트", passwordHash: "unused" });
}
function verified(orderId: string, paymentKey: string) {
  return { orderId, paymentKey, totalAmount: 5000, status: "DONE", currency: "KRW" };
}
type FetchCall = { url: string; init: RequestInit | undefined };
async function withProvider<T>(handler: (call: FetchCall, number: number) => Response | Promise<Response>, run: (calls: FetchCall[]) => Promise<T>) {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = async (input, init) => {
    const call = { url: String(input), init };
    calls.push(call);
    return handler(call, calls.length);
  };
  try { return await run(calls); }
  finally { globalThis.fetch = originalFetch; }
}
function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

test("a verified 5000 KRW payment awards exactly five credits and replays award nothing", async () => {
  const user = account();
  const order = db.createOrder(user.id);
  assert.equal(order.amount, 5000);
  assert.equal(order.credits, 5);
  const key = "confirmed-payment-key";
  await withProvider(() => json(verified(order.id, key)), async (calls) => {
    assert.equal((await confirmPayment(user.id, order.id, key, 5000)).paidRemaining, 5);
    assert.equal((await confirmPayment(user.id, order.id, key, 5000)).paidRemaining, 5);
    assert.equal(calls.length, 1, "locally completed orders do not require another provider confirmation");
    assert.equal(calls[0].url, "https://api.tosspayments.com/v1/payments/confirm");
    assert.equal(calls[0].init?.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { orderId: order.id, paymentKey: key, amount: 5000 });
    const headers = new Headers(calls[0].init?.headers);
    assert.equal(headers.get("authorization"), "Basic mock-test-credential");
    assert.equal(headers.get("idempotency-key"), order.id);
    assert.equal(db.getOrder(user.id, order.id)?.status, "paid");
    await assert.rejects(() => confirmPayment(user.id, order.id, "different-key", 5000));
    assert.equal(db.getUsage(user.id).paidRemaining, 5);
  });
});

test("client amount changes and another account's order fail before any provider operation", async () => {
  const user = account();
  const other = account();
  const order = db.createOrder(user.id);
  await withProvider(() => { throw new Error("provider must not be contacted"); }, async (calls) => {
    await assert.rejects(() => confirmPayment(user.id, order.id, "a-payment-key", 1));
    await assert.rejects(() => confirmPayment(other.id, order.id, "a-payment-key", 5000));
    assert.equal(calls.length, 0);
    assert.equal(db.getUsage(user.id).paidRemaining, 0);
    assert.equal(db.getUsage(other.id).paidRemaining, 0);
    assert.equal(db.getOrder(user.id, order.id)?.status, "pending");
  });
});

test("successful HTTP responses with wrong provider amounts, currency, status, order or key never grant credit", async () => {
  const mismatches = [
    { totalAmount: 1 }, { totalAmount: "5000" }, { currency: "USD" },
    { status: "CANCELED" }, { status: "WAITING_FOR_DEPOSIT" },
    { orderId: "someone-elses-order" }, { paymentKey: "someone-elses-payment" },
  ];
  for (const mismatch of mismatches) {
    const user = account();
    const order = db.createOrder(user.id);
    await withProvider(() => json({ ...verified(order.id, "mismatch-key"), ...mismatch }), async () => {
      await assert.rejects(() => confirmPayment(user.id, order.id, "mismatch-key", 5000), (error: unknown) => error instanceof Error && "code" in error && error.code === "PAYMENT_MISMATCH");
      assert.equal(db.getUsage(user.id).paidRemaining, 0, JSON.stringify(mismatch));
      assert.equal(db.getOrder(user.id, order.id)?.status, "pending");
    });
  }
});

test("provider failures, malformed responses and network errors keep the order retryable", async () => {
  const user = account();
  const order = db.createOrder(user.id);
  for (const handler of [
    () => json({ code: "INVALID_API_KEY" }, 401),
    () => new Response("invalid json", { status: 200 }),
    () => { throw new Error("mock network failure"); },
  ]) {
    await withProvider(handler, async () => {
      await assert.rejects(() => confirmPayment(user.id, order.id, "retryable-key", 5000));
      assert.equal(db.getUsage(user.id).paidRemaining, 0);
      assert.equal(db.getOrder(user.id, order.id)?.status, "pending");
    });
  }
  await withProvider(() => json(verified(order.id, "retryable-key")), async () => {
    assert.equal((await confirmPayment(user.id, order.id, "retryable-key", 5000)).paidRemaining, 5);
  });
});

test("provider already-processed confirmation requires a fresh verified payment lookup", async () => {
  const user = account();
  const order = db.createOrder(user.id);
  const key = "already/processed?payment";
  await withProvider((_call, number) => number === 1 ? json({ code: "ALREADY_PROCESSED_PAYMENT" }, 400) : json(verified(order.id, key)), async (calls) => {
    assert.equal((await confirmPayment(user.id, order.id, key, 5000)).paidRemaining, 5);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, `https://api.tosspayments.com/v1/payments/${encodeURIComponent(key)}`);
    assert.equal(calls[1].init?.method, undefined);
  });
  const secondOrder = db.createOrder(user.id);
  await withProvider((_call, number) => number === 1 ? json({ code: "ALREADY_PROCESSED_PAYMENT" }, 400) : json(verified(order.id, key)), async () => {
    await assert.rejects(() => confirmPayment(user.id, secondOrder.id, key, 5000));
    assert.equal(db.getUsage(user.id).paidRemaining, 5);
    assert.equal(db.getOrder(user.id, secondOrder.id)?.status, "pending");
  });
});

test("concurrent provider confirmations cannot duplicate credits and payment keys cannot cross orders", async () => {
  const user = account();
  const other = account();
  const order = db.createOrder(user.id);
  const key = "concurrent-payment-key";
  await withProvider(() => json(verified(order.id, key)), async () => {
    const results = await Promise.all([
      confirmPayment(user.id, order.id, key, 5000),
      confirmPayment(user.id, order.id, key, 5000),
    ]);
    assert.ok(results.every((usage) => usage.paidRemaining === 5));
    assert.equal(db.getUsage(user.id).paidRemaining, 5);
  });
  const otherOrder = db.createOrder(other.id);
  await withProvider(() => json(verified(otherOrder.id, key)), async () => {
    await assert.rejects(() => confirmPayment(other.id, otherOrder.id, key, 5000));
    assert.equal(db.getUsage(other.id).paidRemaining, 0);
    assert.equal(db.getOrder(other.id, otherOrder.id)?.status, "pending");
    assert.equal(db.getUsage(user.id).paidRemaining, 5);
  });
});
