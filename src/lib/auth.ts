import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { createSession, getSessionUser, deleteSession, type User } from "./db";
import { AppError } from "./http";

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = "byulgyeol_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function checkPassword(password: string, stored: string | undefined) {
  const [salt, hash] = (stored || "00000000000000000000000000000000:" + "0".repeat(128)).split(":");
  const derived = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return !!stored && expected.length === derived.length && timingSafeEqual(expected, derived);
}

export function currentUser(req: NextRequest): User | null {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return token ? getSessionUser(digest(token)) : null;
}

export function requireUser(req: NextRequest): User {
  const user = currentUser(req);
  if (!user) throw new AppError("로그인 후 이용해 주세요.", 401, "AUTH_REQUIRED");
  return user;
}

export function attachSession(res: NextResponse, userId: string, req: NextRequest) {
  const token = randomBytes(32).toString("hex");
  createSession(userId, digest(token), Date.now() + SESSION_SECONDS * 1000);
  res.cookies.set(COOKIE_NAME, token, { httpOnly: true, secure: req.nextUrl.protocol === "https:" || process.env.ASTRO_APP_URL?.startsWith("https://"), sameSite: "lax", maxAge: SESSION_SECONDS, path: "/" });
}

export function removeSession(req: NextRequest, res: NextResponse) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token) deleteSession(digest(token));
  res.cookies.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
}
