import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createUser, getUserByEmail } from "@/lib/db";
import { attachSession, checkPassword, hashPassword, removeSession, digest } from "@/lib/auth";
import { AppError, assertSameOrigin, errorResponse, readJson, rateLimit } from "@/lib/http";
import { sessionState } from "@/lib/state";
export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["register", "login", "logout"]),
  email: z.string().trim().toLowerCase().email("이메일 형식을 확인해 주세요.").max(254).optional(),
  password: z.string().min(12, "비밀번호는 12자 이상이어야 합니다.").max(128).optional(),
  name: z.string().trim().min(1).max(40).optional(),
  consent: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const data = schema.parse(await readJson(req));
    if (data.action === "logout") {
      const res = NextResponse.json(sessionState(null)); removeSession(req, res); return res;
    }
    if (!data.email || !data.password) throw new AppError("이메일과 비밀번호를 입력해 주세요.");
    rateLimit(`auth-email:${digest(data.email)}`, 8, 60_000);
    rateLimit(`auth-total`, 120, 60_000);
    let user;
    if (data.action === "register") {
      if (!data.name || data.consent !== true) throw new AppError("이름과 개인정보 저장 동의가 필요합니다.");
      if (getUserByEmail(data.email)) throw new AppError("이 이메일로 가입할 수 없습니다. 로그인해 주세요.", 409);
      user = createUser({ id: randomUUID(), email: data.email, name: data.name, passwordHash: await hashPassword(data.password) });
    } else {
      user = getUserByEmail(data.email);
      if (!await checkPassword(data.password, user?.passwordHash) || !user) throw new AppError("이메일 또는 비밀번호를 확인해 주세요.", 401);
    }
    const res = NextResponse.json(sessionState(user)); attachSession(res, user.id, req); return res;
  } catch (error) { return errorResponse(error); }
}
