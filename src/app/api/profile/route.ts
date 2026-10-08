import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { setProfile } from "@/lib/db";
import { validateBirthProfile } from "@/lib/chart";
import { AppError, assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { sessionState } from "@/lib/state";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = requireUser(req);
    const body = z.object({ profile: z.unknown(), consent: z.literal(true, { error: "출생 정보 저장에 동의해 주세요." }) }).parse(await readJson(req));
    let profile;
    try { profile = validateBirthProfile(body.profile); }
    catch (error) { throw new AppError(error instanceof Error ? error.message : "출생 정보를 확인해 주세요."); }
    setProfile(user.id, profile);
    return NextResponse.json(sessionState(user));
  } catch (error) { return errorResponse(error); }
}
