import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AppError, assertSameOrigin, errorResponse, readJson, rateLimit } from "@/lib/http";
import { confirmPayment } from "@/lib/payments";
import { paymentAvailable } from "@/lib/state";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = requireUser(req);
    rateLimit(`confirm:${user.id}`, 10, 60_000);
    if (!paymentAvailable()) throw new AppError("결제 서비스가 아직 준비되지 않았습니다.", 503, "PAYMENT_UNAVAILABLE");
    const data = z.object({ orderId: z.string().min(10).max(100), paymentKey: z.string().min(10).max(300), amount: z.number().int().positive() }).parse(await readJson(req));
    const usage = await confirmPayment(user.id, data.orderId, data.paymentKey, data.amount);
    return NextResponse.json({ usage });
  } catch (error) { return errorResponse(error); }
}
