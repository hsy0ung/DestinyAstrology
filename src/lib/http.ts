import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(message: string, public status = 400, public code = "BAD_REQUEST") {
    super(message);
  }
}

export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  // Next can normalize nextUrl to localhost even for a request to 127.0.0.1.
  // Browsers bind Host to the destination; use a fixed origin for public proxy deployments.
  const expected = process.env.ASTRO_APP_URL || `${req.nextUrl.protocol}//${req.headers.get("host") || req.nextUrl.host}`;
  if (origin && origin !== new URL(expected).origin) {
    throw new AppError("다른 사이트에서 보낸 요청은 허용하지 않습니다.", 403, "ORIGIN");
  }
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    throw new AppError("다른 사이트에서 보낸 요청은 허용하지 않습니다.", 403, "ORIGIN");
  }
}

export async function readJson(req: NextRequest): Promise<unknown> {
  if (!req.headers.get("content-type")?.startsWith("application/json")) {
    throw new AppError("JSON 형식으로 요청해 주세요.", 415);
  }
  if (Number(req.headers.get("content-length")) > 32_768) throw new AppError("입력 내용이 너무 깁니다.", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new AppError("입력 내용을 확인해 주세요.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 32_768) { await reader.cancel(); throw new AppError("입력 내용이 너무 깁니다.", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AppError("입력 내용을 확인해 주세요."); }
}

export function errorResponse(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || "입력 내용을 확인해 주세요." }, { status: 400 });
  if (error instanceof Error && "status" in error && typeof error.status === "number") {
    return NextResponse.json({ error: error.message, code: "code" in error ? error.code : undefined }, { status: error.status });
  }
  // Do not write questions, birth profiles, provider error bodies, or credentials to logs.
  console.error("Request failed:", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
}

const windows = new Map<string, { count: number; until: number }>();
export function rateLimit(key: string, max = 15, windowMs = 60_000) {
  const now = Date.now();
  if (windows.size > 2000) for (const [k, v] of windows) if (v.until <= now) windows.delete(k);
  const current = windows.get(key);
  if (!current || current.until <= now) { windows.set(key, { count: 1, until: now + windowMs }); return; }
  if (current.count >= max) throw new AppError("요청이 많습니다. 잠시 후 다시 시도해 주세요.", 429, "RATE_LIMIT");
  current.count += 1;
}
