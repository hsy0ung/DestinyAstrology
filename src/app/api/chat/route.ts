import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getProfile, getConversationContext, getUsage, reserveConversation, completeConversation, failConversation } from "@/lib/db";
import { calculateChart } from "@/lib/chart";
import { generateAdvice } from "@/lib/advice";
import { AppError, assertSameOrigin, errorResponse, readJson, rateLimit } from "@/lib/http";
export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ question: z.string().trim().min(5, "고민을 다섯 글자 이상 적어 주세요.").max(2000, "고민은 2,000자 이내로 적어 주세요."), mode: z.enum(["standard", "deep"]), requestId: z.uuid(), parentId: z.uuid().nullable().optional().default(null) });

export async function POST(req: NextRequest) {
  let reservation: { userId: string; id: string } | undefined;
  try {
    assertSameOrigin(req);
    const user = requireUser(req);
    rateLimit(`chat:${user.id}`, 20, 60_000);
    const body = schema.parse(await readJson(req));
    const profile = getProfile(user.id);
    if (!profile) throw new AppError("출생 정보를 먼저 입력해 주세요.", 400, "PROFILE_REQUIRED");
    const chart = calculateChart(profile);
    const history = getConversationContext(user.id, body.parentId);
    const reserved = reserveConversation(user.id, body.requestId, body.question, body.mode, undefined, body.parentId);
    if (reserved.kind === "existing") return NextResponse.json({ conversation: reserved.conversation, usage: getUsage(user.id) });
    if (reserved.kind === "pending") throw new AppError("답변을 준비하고 있습니다. 잠시 후 다시 확인해 주세요.", 409, "PENDING");
    reservation = { userId: user.id, id: reserved.id };
    const result = await generateAdvice(body.question, body.mode, profile, chart, history.map(({question, answer}) => ({ question, answer })));
    const conversation = completeConversation(user.id, reserved.id, { ...result, chart });
    reservation = undefined;
    return NextResponse.json({ conversation, usage: getUsage(user.id) });
  } catch (error) {
    if (reservation) failConversation(reservation.userId, reservation.id);
    return errorResponse(error);
  }
}
