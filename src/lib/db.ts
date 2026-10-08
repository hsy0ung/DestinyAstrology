import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Advice, BirthProfile, Chart, Conversation } from "./types";

export type User = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  paidCredits: number;
};

export type Order = {
  id: string;
  userId: string;
  amount: 5000;
  credits: 5;
  status: "pending" | "paid";
  paymentKey: string | null;
};

export class DbError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) {
    super(message);
    this.name = "DbError";
  }
}

type UserRow = { id: string; email: string; name: string; password_hash: string; paid_credits: number };
type ConversationRow = {
  id: string;
  user_id: string;
  request_id: string;
  parent_id: string | null;
  question: string;
  mode: "standard" | "deep";
  status: "pending" | "complete";
  answer_json: string | null;
  chart_json: string | null;
  source: "demo" | "ai" | null;
  free_day: string | null;
  paid_charge: number;
  created_at: number;
};
type OrderRow = {
  id: string;
  user_id: string;
  status: "pending" | "paid";
  payment_key: string | null;
};

let database: DatabaseSync | undefined;
const FREE_DAILY = 3;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const STALE_RESERVATION_MS = 2 * 60 * 1000;

function db(): DatabaseSync {
  if (database) return database;
  const filename = process.env.ASTRO_DB_PATH || join(process.cwd(), ".data", "astro.sqlite");
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const connection = new DatabaseSync(filename);
  connection.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      paid_credits INTEGER NOT NULL DEFAULT 0 CHECK (paid_credits >= 0)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      profile_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_usage (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0 AND used <= 3),
      PRIMARY KEY (user_id, day)
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL,
      parent_id TEXT,
      question TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('standard', 'deep')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'complete')),
      answer_json TEXT,
      chart_json TEXT,
      source TEXT CHECK (source IN ('demo', 'ai')),
      free_day TEXT,
      paid_charge INTEGER NOT NULL CHECK (paid_charge IN (0, 1)),
      created_at INTEGER NOT NULL,
      UNIQUE (user_id, request_id),
      CHECK ((free_day IS NULL AND paid_charge = 1) OR (free_day IS NOT NULL AND paid_charge = 0))
    );
    CREATE INDEX IF NOT EXISTS conversations_user ON conversations(user_id, created_at);
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL DEFAULT 5000 CHECK (amount = 5000),
      credits INTEGER NOT NULL DEFAULT 5 CHECK (credits = 5),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
      payment_key TEXT UNIQUE,
      created_at INTEGER NOT NULL,
      CHECK ((status = 'pending' AND payment_key IS NULL) OR (status = 'paid' AND payment_key IS NOT NULL))
    );
    CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id);
  `);
  // Existing local databases predate conversation threads; preserve their rows as independent roots.
  connection.exec("BEGIN IMMEDIATE");
  try {
    const columns = connection.prepare("PRAGMA table_info(conversations)").all() as { name: string }[];
    if (!columns.some((column) => column.name === "parent_id")) {
      connection.exec("ALTER TABLE conversations ADD COLUMN parent_id TEXT");
    }
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    connection.close();
    throw error;
  }
  database = connection;
  return connection;
}

export function closeDb(): void {
  database?.close();
  database = undefined;
}

function transaction<T>(operation: () => T): T {
  const connection = db();
  connection.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    connection.exec("COMMIT");
    return result;
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}

function userFromRow(row: UserRow): User {
  return { id: row.id, email: row.email, name: row.name, passwordHash: row.password_hash, paidCredits: row.paid_credits };
}

function requireUser(userId: string): User {
  const user = getUserById(userId);
  if (!user) throw new DbError("계정을 찾을 수 없습니다.", "NOT_FOUND", 404);
  return user;
}

function conversationFromRow(row: ConversationRow): Conversation {
  if (row.status !== "complete" || !row.answer_json || !row.chart_json || !row.source) {
    throw new DbError("답변을 준비하고 있습니다.", "BUSY", 409);
  }
  return {
    id: row.id,
    parentId: row.parent_id,
    question: row.question,
    mode: row.mode,
    answer: JSON.parse(row.answer_json) as Advice,
    chart: JSON.parse(row.chart_json) as Chart,
    source: row.source,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function orderFromRow(row: OrderRow): Order {
  return { id: row.id, userId: row.user_id, amount: 5000, credits: 5, status: row.status, paymentKey: row.payment_key };
}

function calendar(now: Date): { day: string; resetsAt: string } {
  const local = new Date(now.getTime() + KST_OFFSET_MS);
  const day = local.toISOString().slice(0, 10);
  const nextMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - KST_OFFSET_MS;
  return { day, resetsAt: new Date(nextMidnight).toISOString() };
}

function usedToday(userId: string, day: string): number {
  const row = db().prepare("SELECT used FROM daily_usage WHERE user_id = ? AND day = ?").get(userId, day) as { used: number } | undefined;
  return row?.used ?? 0;
}

export function createUser(input: { id: string; email: string; name: string; passwordHash: string }): User {
  try {
    db().prepare("INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)").run(input.id, input.email.toLowerCase(), input.name, input.passwordHash);
  } catch (error) {
    if (getUserByEmail(input.email)) throw new DbError("이미 가입된 이메일입니다.", "EMAIL_EXISTS", 409);
    throw error;
  }
  return requireUser(input.id);
}

export function getUserByEmail(email: string): User | null {
  const row = db().prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()) as UserRow | undefined;
  return row ? userFromRow(row) : null;
}

export function getUserById(id: string): User | null {
  const row = db().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row ? userFromRow(row) : null;
}

export function createSession(userId: string, tokenHash: string, expiresAt: number): void {
  db().prepare("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)").run(userId, tokenHash, expiresAt);
}

export function getSessionUser(tokenHash: string): User | null {
  const row = db().prepare(`
    SELECT users.* FROM users JOIN sessions ON sessions.user_id = users.id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash, Date.now()) as UserRow | undefined;
  return row ? userFromRow(row) : null;
}

export function deleteSession(tokenHash: string): void {
  db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export function getProfile(userId: string): BirthProfile | null {
  const row = db().prepare("SELECT profile_json FROM profiles WHERE user_id = ?").get(userId) as { profile_json: string } | undefined;
  return row ? JSON.parse(row.profile_json) as BirthProfile : null;
}

export function setProfile(userId: string, profile: BirthProfile): void {
  db().prepare(`
    INSERT INTO profiles (user_id, profile_json) VALUES (?, ?)
    ON CONFLICT (user_id) DO UPDATE SET profile_json = excluded.profile_json
  `).run(userId, JSON.stringify(profile));
}

export function getUsage(userId: string, now = new Date()): { freeRemaining: number; paidRemaining: number; resetsAt: string } {
  return transaction(() => {
    reclaimStaleReservations(userId, now);
    const user = requireUser(userId);
    const { day, resetsAt } = calendar(now);
    return { freeRemaining: Math.max(0, FREE_DAILY - usedToday(userId, day)), paidRemaining: user.paidCredits, resetsAt };
  });
}

export function getConversations(userId: string): Conversation[] {
  const rows = db().prepare(`
    SELECT * FROM conversations WHERE user_id = ? AND status = 'complete'
    ORDER BY created_at DESC, rowid DESC LIMIT 30
  `).all(userId) as ConversationRow[];
  return rows.reverse().map(conversationFromRow);
}

export function getConversationContext(userId: string, parentId: string | null, max = 6): Conversation[] {
  if (parentId === null) return [];
  const statement = db().prepare("SELECT * FROM conversations WHERE user_id = ? AND id = ? AND status = 'complete'");
  let row = statement.get(userId, parentId) as ConversationRow | undefined;
  if (!row) throw new DbError("이전 대화를 찾을 수 없습니다.", "NOT_FOUND", 404);
  const limit = Number.isFinite(max) ? Math.max(0, Math.trunc(max)) : 6;
  const chain: Conversation[] = [];
  const visited = new Set<string>();
  while (row && chain.length < limit && !visited.has(row.id)) {
    visited.add(row.id);
    chain.push(conversationFromRow(row));
    row = row.parent_id === null ? undefined : statement.get(userId, row.parent_id) as ConversationRow | undefined;
  }
  return chain.reverse();
}

function refundPending(row: ConversationRow): void {
  // Only pending rows are refundable, and deletion in this transaction makes a second refund impossible.
  if (row.status !== "pending") return;
  if (row.free_day) {
    db().prepare("UPDATE daily_usage SET used = used - 1 WHERE user_id = ? AND day = ? AND used > 0").run(row.user_id, row.free_day);
  } else if (row.paid_charge) {
    db().prepare("UPDATE users SET paid_credits = paid_credits + 1 WHERE id = ?").run(row.user_id);
  }
  db().prepare("DELETE FROM conversations WHERE id = ? AND user_id = ? AND status = 'pending'").run(row.id, row.user_id);
}

// The caller holds an IMMEDIATE transaction so recovery cannot race completion or another refund.
function reclaimStaleReservations(userId: string, now: Date): void {
  const stale = db().prepare(`
    SELECT * FROM conversations WHERE user_id = ? AND status = 'pending' AND created_at < ?
  `).all(userId, now.getTime() - STALE_RESERVATION_MS) as ConversationRow[];
  stale.forEach(refundPending);
}

export function reserveConversation(
  userId: string,
  requestId: string,
  question: string,
  mode: "standard" | "deep",
  now = new Date(),
  parentId: string | null = null,
): { kind: "reserved"; id: string } | { kind: "existing"; conversation: Conversation } | { kind: "pending" } {
  type Reservation = { kind: "reserved"; id: string } | { kind: "existing"; conversation: Conversation } | { kind: "pending" };
  const result = transaction<Reservation | DbError>(() => {
    requireUser(userId);
    reclaimStaleReservations(userId, now);

    const existing = db().prepare("SELECT * FROM conversations WHERE user_id = ? AND request_id = ?").get(userId, requestId) as ConversationRow | undefined;
    if (existing) {
      if (existing.question !== question || existing.mode !== mode || existing.parent_id !== parentId) {
        return new DbError("같은 요청 번호에 다른 질문을 사용할 수 없습니다.", "CONFLICT", 409);
      }
      return existing.status === "complete" ? { kind: "existing", conversation: conversationFromRow(existing) } : { kind: "pending" };
    }
    if (parentId !== null) {
      const parent = db().prepare("SELECT id FROM conversations WHERE user_id = ? AND id = ? AND status = 'complete'").get(userId, parentId);
      if (!parent) return new DbError("이전 대화를 찾을 수 없습니다.", "NOT_FOUND", 404);
    }
    const pending = db().prepare("SELECT id FROM conversations WHERE user_id = ? AND status = 'pending' LIMIT 1").get(userId);
    if (pending) return new DbError("앞선 답변이 완료된 후 다시 질문해 주세요.", "BUSY", 409);

    const { day } = calendar(now);
    let freeDay: string | null = null;
    if (mode === "standard" && usedToday(userId, day) < FREE_DAILY) {
      db().prepare(`
        INSERT INTO daily_usage (user_id, day, used) VALUES (?, ?, 1)
        ON CONFLICT (user_id, day) DO UPDATE SET used = daily_usage.used + 1
      `).run(userId, day);
      freeDay = day;
    } else {
      const debit = db().prepare("UPDATE users SET paid_credits = paid_credits - 1 WHERE id = ? AND paid_credits > 0").run(userId);
      if (!debit.changes) return new DbError(mode === "deep" ? "심화 대화에는 대화 이용권이 필요합니다." : "오늘의 무료 대화를 모두 사용했습니다. 추가 대화에는 대화 이용권이 필요합니다.", "LIMIT", 402);
    }
    const id = randomUUID();
    db().prepare(`
      INSERT INTO conversations (id, user_id, request_id, parent_id, question, mode, status, free_day, paid_charge, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(id, userId, requestId, parentId, question, mode, freeDay, freeDay ? 0 : 1, now.getTime());
    return { kind: "reserved", id };
  });
  // Expired reservations are reclaimed even when the new request has no eligible credit.
  if (result instanceof DbError) throw result;
  return result;
}

export function completeConversation(userId: string, id: string, input: { answer: Advice; chart: Chart; source: "demo" | "ai" }): Conversation {
  return transaction(() => {
    const row = db().prepare("SELECT * FROM conversations WHERE user_id = ? AND id = ?").get(userId, id) as ConversationRow | undefined;
    if (!row) throw new DbError("대화 요청을 찾을 수 없습니다. 다시 질문해 주세요.", "NOT_FOUND", 404);
    if (row.status === "complete") return conversationFromRow(row);
    db().prepare(`
      UPDATE conversations SET status = 'complete', answer_json = ?, chart_json = ?, source = ?
      WHERE id = ? AND user_id = ? AND status = 'pending'
    `).run(JSON.stringify(input.answer), JSON.stringify(input.chart), input.source, id, userId);
    return conversationFromRow({ ...row, status: "complete", answer_json: JSON.stringify(input.answer), chart_json: JSON.stringify(input.chart), source: input.source });
  });
}

export function failConversation(userId: string, id: string): void {
  transaction(() => {
    const row = db().prepare("SELECT * FROM conversations WHERE user_id = ? AND id = ? AND status = 'pending'").get(userId, id) as ConversationRow | undefined;
    if (row) refundPending(row);
  });
}

export function createOrder(userId: string): Order {
  const id = randomUUID();
  db().prepare("INSERT INTO orders (id, user_id, created_at) VALUES (?, ?, ?)").run(id, userId, Date.now());
  return { id, userId, amount: 5000, credits: 5, status: "pending", paymentKey: null };
}

export function getOrder(userId: string, id: string): Order | null {
  const row = db().prepare("SELECT * FROM orders WHERE user_id = ? AND id = ?").get(userId, id) as OrderRow | undefined;
  return row ? orderFromRow(row) : null;
}

// Call only after the server verifies the amount, order ID, and success status with the payment provider.
export function creditOrder(userId: string, orderId: string, paymentKey: string): Order {
  return transaction(() => {
    const order = getOrder(userId, orderId);
    if (!order) throw new DbError("주문을 찾을 수 없습니다.", "NOT_FOUND", 404);
    if (order.status === "paid") {
      if (order.paymentKey !== paymentKey) throw new DbError("이미 처리된 주문입니다.", "CONFLICT", 409);
      return order;
    }
    if (!paymentKey) throw new DbError("결제 확인 번호가 필요합니다.", "CONFLICT", 409);
    const reused = db().prepare("SELECT id FROM orders WHERE payment_key = ?").get(paymentKey);
    if (reused) throw new DbError("이미 사용된 결제 확인 번호입니다.", "CONFLICT", 409);
    db().prepare("UPDATE orders SET status = 'paid', payment_key = ? WHERE id = ? AND user_id = ? AND status = 'pending'").run(paymentKey, orderId, userId);
    db().prepare("UPDATE users SET paid_credits = paid_credits + 5 WHERE id = ?").run(userId);
    return { ...order, status: "paid", paymentKey };
  });
}

export function deleteAccount(userId: string): void {
  db().prepare("DELETE FROM users WHERE id = ?").run(userId);
}
