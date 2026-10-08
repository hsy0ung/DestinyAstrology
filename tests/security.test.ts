import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { NextRequest, NextResponse } from "next/server";

const directory = mkdtempSync(join(tmpdir(), "destiny-security-"));
process.env.ASTRO_DB_PATH = join(directory, "test.sqlite");
const originalOrigin = process.env.ASTRO_APP_URL;
process.env.ASTRO_APP_URL = "https://destiny.example";

let db: typeof import("../src/lib/db");
let auth: typeof import("../src/lib/auth");
let http: typeof import("../src/lib/http");
let authRoute: typeof import("../src/app/api/auth/route");
before(async () => {
  db = await import("../src/lib/db");
  auth = await import("../src/lib/auth");
  http = await import("../src/lib/http");
  authRoute = await import("../src/app/api/auth/route");
});
after(() => {
  db.closeDb();
  if (originalOrigin === undefined) delete process.env.ASTRO_APP_URL;
  else process.env.ASTRO_APP_URL = originalOrigin;
  rmSync(directory, { recursive: true, force: true });
});

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://destiny.example/api/auth", {
    method: "POST",
    headers: { origin: "https://destiny.example", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("passwords use independent salts and accept only the original password", async () => {
  const password = "correct horse battery staple";
  const first = await auth.hashPassword(password);
  const second = await auth.hashPassword(password);
  assert.notEqual(first, second);
  assert.notEqual(first.split(":")[0], second.split(":")[0]);
  assert.equal(await auth.checkPassword(password, first), true);
  assert.equal(await auth.checkPassword(password, second), true);
  assert.equal(await auth.checkPassword("wrong horse battery staple", first), false);
  assert.equal(await auth.checkPassword(password, undefined), false);
  assert.equal(first.includes(password), false);
});

test("mutation origins reject sibling domains, other ports and browser cross-site requests", () => {
  assert.doesNotThrow(() => http.assertSameOrigin(request({})));
  for (const origin of ["https://attacker.example", "https://destiny.example:8443", "http://destiny.example", "null"]) {
    assert.throws(() => http.assertSameOrigin(request({}, { origin })), (error: unknown) => error instanceof http.AppError && error.status === 403);
  }
  assert.throws(() => http.assertSameOrigin(request({}, { "sec-fetch-site": "cross-site" })), (error: unknown) => error instanceof http.AppError && error.status === 403);
  const withoutOrigin = new NextRequest("https://destiny.example/api/auth", { method: "POST", headers: { "sec-fetch-site": "cross-site" } });
  assert.throws(() => http.assertSameOrigin(withoutOrigin), (error: unknown) => error instanceof http.AppError && error.status === 403);
});

test("auth rejects cross-site registration before storing an account", async () => {
  const email = "csrf@example.com";
  const response = await authRoute.POST(request({ action: "register", email, name: "테스트", password: "a secure password", consent: true }, { origin: "https://attacker.example" }));
  assert.equal(response.status, 403);
  assert.equal(db.getUserByEmail(email), null);
  assert.equal(response.cookies.get("byulgyeol_session"), undefined);
});

test("registration requires at least twelve characters and explicit data consent", async () => {
  for (const [index, body] of [
    { action: "register", email: "short@example.com", name: "테스트", password: "12345678901", consent: true },
    { action: "register", email: "consent@example.com", name: "테스트", password: "123456789012", consent: false },
  ].entries()) {
    const response = await authRoute.POST(request(body));
    assert.equal(response.status, 400, `invalid registration ${index}`);
    assert.equal(db.getUserByEmail(body.email), null);
    assert.equal(response.cookies.get("byulgyeol_session"), undefined);
  }
});

test("successful registration issues a protected opaque session without leaking the password hash", async () => {
  const password = "123456789012";
  const response = await authRoute.POST(request({ action: "register", email: "Secure@Example.com", name: "테스트", password, consent: true }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.user.email, "secure@example.com");
  assert.equal("passwordHash" in payload.user, false);
  assert.equal("paidCredits" in payload.user, false);
  const account = db.getUserByEmail("secure@example.com");
  assert.ok(account);
  assert.notEqual(account.passwordHash, password);
  assert.equal(await auth.checkPassword(password, account.passwordHash), true);
  const cookie = response.cookies.get("byulgyeol_session");
  assert.ok(cookie);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.secure, true);
  assert.equal(cookie.sameSite, "lax");
  assert.equal(db.getSessionUser(cookie.value), null, "raw session tokens must not be stored");
  assert.equal(db.getSessionUser(auth.digest(cookie.value))?.id, account.id);
  const authenticated = new NextRequest("https://destiny.example/api/session", { headers: { cookie: `byulgyeol_session=${cookie.value}` } });
  assert.equal(auth.currentUser(authenticated)?.id, account.id);
  const logout = await authRoute.POST(request({ action: "logout" }, { cookie: `byulgyeol_session=${cookie.value}` }));
  assert.equal(logout.status, 200);
  assert.equal(logout.cookies.get("byulgyeol_session")?.maxAge, 0);
  assert.equal(auth.currentUser(authenticated), null);
});

test("login failures reveal the same message for unknown accounts and wrong passwords", async () => {
  const known = await authRoute.POST(request({ action: "login", email: "secure@example.com", password: "another wrong password" }));
  const unknown = await authRoute.POST(request({ action: "login", email: "unknown@example.com", password: "another wrong password" }));
  assert.equal(known.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await known.json(), await unknown.json());
  assert.equal(known.cookies.get("byulgyeol_session"), undefined);
  assert.equal(unknown.cookies.get("byulgyeol_session"), undefined);
});

test("session cookies are unique and untrusted token values grant no identity", () => {
  const account = db.createUser({ id: "session-user", email: "session@example.com", name: "세션", passwordHash: "unused" });
  const req = new NextRequest("https://destiny.example");
  const first = NextResponse.json({ ok: true });
  const second = NextResponse.json({ ok: true });
  auth.attachSession(first, account.id, req);
  auth.attachSession(second, account.id, req);
  assert.notEqual(first.cookies.get("byulgyeol_session")?.value, second.cookies.get("byulgyeol_session")?.value);
  const forged = new NextRequest("https://destiny.example", { headers: { cookie: "byulgyeol_session=attacker-controlled" } });
  assert.equal(auth.currentUser(forged), null);
  assert.throws(() => auth.requireUser(forged), (error: unknown) => error instanceof http.AppError && error.status === 401);
});

test("JSON inputs reject unexpected content types, invalid JSON and oversized bodies", async () => {
  await assert.rejects(() => http.readJson(request({}, { "content-type": "text/plain" })), (error: unknown) => error instanceof http.AppError && error.status === 415);
  await assert.rejects(() => http.readJson(new NextRequest("https://destiny.example", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })), (error: unknown) => error instanceof http.AppError && error.status === 400);
  await assert.rejects(() => http.readJson(request({ question: "가".repeat(11_000) })), (error: unknown) => error instanceof http.AppError && error.status === 413);
});
