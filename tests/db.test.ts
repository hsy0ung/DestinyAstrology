import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, test } from "node:test";
import type { Advice, BirthProfile, Chart } from "../src/lib/types";

const directory = mkdtempSync(join(tmpdir(), "destiny-db-"));
process.env.ASTRO_DB_PATH = join(directory, "test.sqlite");
let db: typeof import("../src/lib/db");
before(async () => {
  db = await import("../src/lib/db");
});
after(() => {
  db.closeDb();
  rmSync(directory, { recursive: true, force: true });
});

let counter = 0;
function user() {
  counter += 1;
  return db.createUser({ id: `user-${counter}`, email: `user-${counter}@example.com`, name: "테스트", passwordHash: "test-hash" });
}
const answer: Advice = { summary: "정리", personality: "성향", saju: "사주", astrology: "별자리", integration: "통합", actions: ["행동"], followUp: "다음 질문" };
const chart: Chart = { pillars: [], dayMaster: "갑", elements: [], sun: { sign: "양자리", degree: 10 }, moon: null, ascendant: null, notes: [] };
const completion = { answer, chart, source: "demo" as const };
const profile: BirthProfile = { name: "테스트", birthDate: "1995-01-01", birthTime: "12:00", city: "서울", timezone: "Asia/Seoul", latitude: 37.5665, longitude: 126.978 };

function ask(userId: string, requestId: string, now?: Date, mode: "standard" | "deep" = "standard", parentId: string | null = null) {
  const result = db.reserveConversation(userId, requestId, "진로가 고민이에요", mode, now, parentId);
  assert.equal(result.kind, "reserved");
  if (result.kind !== "reserved") throw new Error("Reservation expected");
  return db.completeConversation(userId, result.id, completion);
}

function hasCode(code: string) {
  return (error: unknown) => error instanceof db.DbError && error.code === code;
}

test("three free conversations reset at Korean midnight rather than UTC midnight", () => {
  const account = user();
  const beforeMidnight = new Date("2026-10-08T14:59:59.000Z");
  assert.deepEqual(db.getUsage(account.id, beforeMidnight), { freeRemaining: 3, paidRemaining: 0, resetsAt: "2026-10-08T15:00:00.000Z" });
  for (let index = 0; index < 3; index += 1) ask(account.id, `before-${index}`, beforeMidnight);
  assert.equal(db.getUsage(account.id, beforeMidnight).freeRemaining, 0);
  assert.throws(() => db.reserveConversation(account.id, "fourth", "질문", "standard", beforeMidnight), hasCode("LIMIT"));
  const afterMidnight = new Date("2026-10-08T15:00:00.000Z");
  assert.deepEqual(db.getUsage(account.id, afterMidnight), { freeRemaining: 3, paidRemaining: 0, resetsAt: "2026-10-09T15:00:00.000Z" });
  ask(account.id, "next-day", afterMidnight);
  assert.equal(db.getUsage(account.id, afterMidnight).freeRemaining, 2);
});

test("payment credits are applied once, verified payment keys cannot be reused, and orders belong to the account", () => {
  const account = user();
  const other = user();
  const order = db.createOrder(account.id);
  assert.equal(order.amount, 5000);
  assert.equal(order.credits, 5);
  assert.equal(db.getOrder(other.id, order.id), null);
  assert.throws(() => db.creditOrder(other.id, order.id, "verified-key-one"), hasCode("NOT_FOUND"));
  assert.equal(db.creditOrder(account.id, order.id, "verified-key-one").status, "paid");
  db.creditOrder(account.id, order.id, "verified-key-one");
  assert.equal(db.getUserById(account.id)?.paidCredits, 5);
  assert.throws(() => db.creditOrder(account.id, order.id, "different-key"), hasCode("CONFLICT"));
  const secondOrder = db.createOrder(other.id);
  assert.throws(() => db.creditOrder(other.id, secondOrder.id, "verified-key-one"), hasCode("CONFLICT"));
  assert.equal(db.getUserById(other.id)?.paidCredits, 0);
  assert.equal(db.getOrder(other.id, secondOrder.id)?.status, "pending");
});

test("deep conversations require paid credit and standard conversations use free credit first", () => {
  const account = user();
  const now = new Date("2026-10-08T06:00:00.000Z");
  assert.throws(() => db.reserveConversation(account.id, "deep-no-credit", "질문", "deep", now), hasCode("LIMIT"));
  assert.equal(db.getUsage(account.id, now).freeRemaining, 3);
  const order = db.createOrder(account.id);
  db.creditOrder(account.id, order.id, "verified-deep-key");
  ask(account.id, "deep", now, "deep");
  assert.equal(db.getUsage(account.id, now).freeRemaining, 3);
  assert.equal(db.getUsage(account.id, now).paidRemaining, 4);
  for (let index = 0; index < 3; index += 1) ask(account.id, `standard-${index}`, now);
  assert.equal(db.getUsage(account.id, now).paidRemaining, 4);
  ask(account.id, "standard-paid", now);
  assert.equal(db.getUsage(account.id, now).paidRemaining, 3);
});

test("a failed response restores its exact credit once and the request can be retried", () => {
  const account = user();
  const now = new Date("2026-10-08T14:59:59.000Z");
  const reserved = db.reserveConversation(account.id, "retry", "질문", "standard", now);
  assert.equal(reserved.kind, "reserved");
  if (reserved.kind !== "reserved") throw new Error("Reservation expected");
  assert.equal(db.getUsage(account.id, now).freeRemaining, 2);
  db.failConversation(account.id, reserved.id);
  db.failConversation(account.id, reserved.id);
  assert.equal(db.getUsage(account.id, now).freeRemaining, 3);
  const retried = db.reserveConversation(account.id, "retry", "질문", "standard", now);
  assert.equal(retried.kind, "reserved");
  if (retried.kind !== "reserved") throw new Error("Reservation expected");
  db.completeConversation(account.id, retried.id, completion);
  db.failConversation(account.id, retried.id);
  assert.equal(db.getUsage(account.id, now).freeRemaining, 2);

  const order = db.createOrder(account.id);
  db.creditOrder(account.id, order.id, "refund-paid-key");
  const deep = db.reserveConversation(account.id, "failed-deep", "질문", "deep", now);
  if (deep.kind !== "reserved") throw new Error("Reservation expected");
  assert.equal(db.getUsage(account.id, now).paidRemaining, 4);
  db.failConversation(account.id, deep.id);
  db.failConversation(account.id, deep.id);
  assert.equal(db.getUsage(account.id, now).paidRemaining, 5);
});

test("duplicate requests are idempotent, payload conflicts and concurrent requests do not spend credit", () => {
  const account = user();
  const other = user();
  const now = new Date("2026-10-08T06:00:00.000Z");
  const reserved = db.reserveConversation(account.id, "shared-id", "질문", "standard", now);
  if (reserved.kind !== "reserved") throw new Error("Reservation expected");
  assert.deepEqual(db.reserveConversation(account.id, "shared-id", "질문", "standard", now), { kind: "pending" });
  assert.throws(() => db.reserveConversation(account.id, "shared-id", "다른 질문", "standard", now), hasCode("CONFLICT"));
  assert.throws(() => db.reserveConversation(account.id, "another-id", "질문", "standard", now), hasCode("BUSY"));
  assert.equal(db.getUsage(account.id, now).freeRemaining, 2);
  assert.throws(() => db.completeConversation(other.id, reserved.id, completion), hasCode("NOT_FOUND"));
  db.failConversation(other.id, reserved.id);
  assert.equal(db.getUsage(account.id, now).freeRemaining, 2);
  const completed = db.completeConversation(account.id, reserved.id, completion);
  assert.deepEqual(db.reserveConversation(account.id, "shared-id", "질문", "standard", now), { kind: "existing", conversation: completed });
  assert.equal(db.getUsage(account.id, now).freeRemaining, 2);
  ask(other.id, "shared-id", now);
  assert.equal(db.getConversations(account.id).length, 1);
  assert.equal(db.getConversations(other.id).length, 1);
});

test("stale reservations refund the original day across midnight before a new reservation", () => {
  const account = user();
  const previousDay = new Date("2026-10-08T14:59:00.000Z");
  const stale = db.reserveConversation(account.id, "stale", "질문", "standard", previousDay);
  if (stale.kind !== "reserved") throw new Error("Reservation expected");
  const nextDay = new Date("2026-10-08T15:01:01.000Z");
  ask(account.id, "fresh", nextDay);
  assert.equal(db.getUsage(account.id, previousDay).freeRemaining, 3);
  assert.equal(db.getUsage(account.id, nextDay).freeRemaining, 2);
  db.failConversation(account.id, stale.id);
  assert.equal(db.getUsage(account.id, nextDay).freeRemaining, 2);
  assert.throws(() => db.completeConversation(account.id, stale.id, completion), hasCode("NOT_FOUND"));
});

test("stale credit is reclaimed even when the next request needs unavailable paid credit", () => {
  const account = user();
  const now = new Date("2026-10-08T06:00:00.000Z");
  const stale = db.reserveConversation(account.id, "expired-free", "질문", "standard", now);
  if (stale.kind !== "reserved") throw new Error("Reservation expected");
  const later = new Date(now.getTime() + 120_001);
  assert.throws(() => db.reserveConversation(account.id, "deep-without-credit", "질문", "deep", later), hasCode("LIMIT"));
  assert.equal(db.getUsage(account.id, later).freeRemaining, 3);
  assert.throws(() => db.completeConversation(account.id, stale.id, completion), hasCode("NOT_FOUND"));
});

test("reading usage alone recovers the last free or paid credit after an interrupted response", () => {
  const account = user();
  const now = new Date("2026-10-08T06:00:00.000Z");
  const later = new Date(now.getTime() + 120_001);
  ask(account.id, "first-free", now);
  ask(account.id, "second-free", now);
  const finalFree = db.reserveConversation(account.id, "interrupted-free", "질문", "standard", now);
  if (finalFree.kind !== "reserved") throw new Error("Reservation expected");
  assert.equal(db.getUsage(account.id, now).freeRemaining, 0);
  assert.equal(db.getUsage(account.id, later).freeRemaining, 1);
  assert.equal(db.getUsage(account.id, later).freeRemaining, 1);
  assert.throws(() => db.completeConversation(account.id, finalFree.id, completion), hasCode("NOT_FOUND"));

  const order = db.createOrder(account.id);
  db.creditOrder(account.id, order.id, "usage-recovery-paid-key");
  for (let index = 0; index < 4; index += 1) ask(account.id, `paid-${index}`, now, "deep");
  const finalPaid = db.reserveConversation(account.id, "interrupted-paid", "질문", "deep", now);
  if (finalPaid.kind !== "reserved") throw new Error("Reservation expected");
  assert.equal(db.getUsage(account.id, now).paidRemaining, 0);
  assert.equal(db.getUsage(account.id, later).paidRemaining, 1);
  assert.equal(db.getUsage(account.id, later).paidRemaining, 1);
  db.failConversation(account.id, finalPaid.id);
  assert.equal(db.getUsage(account.id, later).paidRemaining, 1);
});

test("sessions expire and account deletion removes profiles, sessions, conversations, orders and usage", () => {
  const account = user();
  db.setProfile(account.id, profile);
  assert.deepEqual(db.getProfile(account.id), profile);
  db.createSession(account.id, "live-session-hash", Date.now() + 60_000);
  db.createSession(account.id, "expired-session-hash", Date.now() - 1);
  assert.equal(db.getSessionUser("live-session-hash")?.id, account.id);
  assert.equal(db.getSessionUser("expired-session-hash"), null);
  ask(account.id, "saved-chat");
  const order = db.createOrder(account.id);
  db.deleteAccount(account.id);
  assert.equal(db.getUserById(account.id), null);
  assert.equal(db.getProfile(account.id), null);
  assert.equal(db.getSessionUser("live-session-hash"), null);
  assert.deepEqual(db.getConversations(account.id), []);
  assert.equal(db.getOrder(account.id, order.id), null);
  // Reusing the ID demonstrates that daily usage also cascaded rather than surviving account deletion.
  db.createUser({ id: account.id, email: account.email, name: account.name, passwordHash: account.passwordHash });
  assert.equal(db.getUsage(account.id).freeRemaining, 3);
});

test("conversation history returns the latest thirty replies in chronological order", () => {
  const account = user();
  for (let index = 0; index < 33; index += 1) {
    ask(account.id, `history-${index}`, new Date(Date.UTC(2026, 0, index + 1, 6)));
  }
  const history = db.getConversations(account.id);
  assert.equal(history.length, 30);
  assert.equal(history[0].createdAt, "2026-01-04T06:00:00.000Z");
  assert.equal(history[29].createdAt, "2026-02-02T06:00:00.000Z");
});

test("new roots exclude earlier conversations and follow-ups include only their own ancestor chain", () => {
  const account = user();
  const dayOne = new Date("2026-10-08T06:00:00.000Z");
  const dayTwo = new Date("2026-10-09T06:00:00.000Z");
  const firstRoot = ask(account.id, "first-thread", dayOne);
  const secondRoot = ask(account.id, "second-thread", dayOne);
  assert.equal(firstRoot.parentId, null);
  assert.equal(secondRoot.parentId, null);
  assert.deepEqual(db.getConversationContext(account.id, null), []);
  const firstFollowUp = ask(account.id, "first-follow-up", dayOne, "standard", firstRoot.id);
  const secondFollowUp = ask(account.id, "second-follow-up", dayTwo, "standard", firstFollowUp.id);
  assert.equal(firstFollowUp.parentId, firstRoot.id);
  assert.deepEqual(db.getConversationContext(account.id, secondFollowUp.id).map((item) => item.id), [firstRoot.id, firstFollowUp.id, secondFollowUp.id]);
  assert.deepEqual(db.getConversationContext(account.id, secondFollowUp.id, 2).map((item) => item.id), [firstFollowUp.id, secondFollowUp.id]);
  assert.deepEqual(db.getConversationContext(account.id, secondRoot.id).map((item) => item.id), [secondRoot.id]);
});

test("foreign or unfinished parents cannot be reserved or read, and changing a duplicate request parent conflicts", () => {
  const account = user();
  const other = user();
  const now = new Date("2026-10-08T06:00:00.000Z");
  const root = ask(account.id, "owned-root", now);
  const foreignRoot = ask(other.id, "foreign-root", now);
  assert.throws(() => db.getConversationContext(account.id, foreignRoot.id), hasCode("NOT_FOUND"));
  assert.throws(() => db.reserveConversation(account.id, "foreign-parent", "질문", "standard", now, foreignRoot.id), hasCode("NOT_FOUND"));
  assert.throws(() => db.reserveConversation(account.id, "missing-parent", "질문", "standard", now, "missing-id"), hasCode("NOT_FOUND"));
  assert.equal(db.getUsage(account.id, now).freeRemaining, 2);

  const pending = db.reserveConversation(account.id, "pending-parent", "질문", "standard", now, root.id);
  if (pending.kind !== "reserved") throw new Error("Reservation expected");
  assert.throws(() => db.getConversationContext(account.id, pending.id), hasCode("NOT_FOUND"));
  assert.throws(() => db.reserveConversation(account.id, "unfinished-parent", "질문", "standard", now, pending.id), hasCode("NOT_FOUND"));
  assert.throws(() => db.reserveConversation(account.id, "pending-parent", "질문", "standard", now, null), hasCode("CONFLICT"));
  assert.deepEqual(db.reserveConversation(account.id, "pending-parent", "질문", "standard", now, root.id), { kind: "pending" });
  const completed = db.completeConversation(account.id, pending.id, completion);
  assert.throws(() => db.reserveConversation(account.id, "pending-parent", "질문", "standard", now, null), hasCode("CONFLICT"));
  assert.deepEqual(db.reserveConversation(account.id, "pending-parent", "질문", "standard", now, root.id), { kind: "existing", conversation: completed });
  assert.equal(db.getUsage(account.id, now).freeRemaining, 1);
});

test("legacy SQLite databases gain the thread column without losing existing history", () => {
  db.closeDb();
  const legacyFilename = join(directory, "legacy.sqlite");
  const connection = new DatabaseSync(legacyFilename);
  connection.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, request_id TEXT NOT NULL,
      question TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL,
      answer_json TEXT, chart_json TEXT, source TEXT,
      free_day TEXT, paid_charge INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
  `);
  connection.prepare(`INSERT INTO conversations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "legacy-chat", "legacy-user", "legacy-request", "이전 질문", "standard", "complete",
    JSON.stringify(answer), JSON.stringify(chart), "demo", "2026-10-08", 0, Date.parse("2026-10-08T06:00:00.000Z"),
  );
  connection.close();
  process.env.ASTRO_DB_PATH = legacyFilename;
  try {
    const history = db.getConversations("legacy-user");
    assert.equal(history.length, 1);
    assert.equal(history[0].id, "legacy-chat");
    assert.equal(history[0].parentId, null);
    assert.deepEqual(db.getConversationContext("legacy-user", "legacy-chat"), history);
    db.closeDb();
    assert.equal(db.getConversations("legacy-user").length, 1);
  } finally {
    db.closeDb();
    process.env.ASTRO_DB_PATH = join(directory, "test.sqlite");
  }
});
