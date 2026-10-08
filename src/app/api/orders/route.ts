import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createOrder } from "@/lib/db";
import { AppError, assertSameOrigin, errorResponse, rateLimit } from "@/lib/http";
import { paymentAvailable } from "@/lib/state";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = requireUser(req);
    rateLimit(`order:${user.id}`, 5, 60_000);
    if (!paymentAvailable()) throw new AppError("결제 서비스가 아직 준비되지 않았습니다.", 503, "PAYMENT_UNAVAILABLE");
    const order = createOrder(user.id);
    return NextResponse.json({ orderId: order.id, amount: order.amount, orderName: "별결 대화 이용권 5회", clientKey: process.env.ASTRO_TOSS_CLIENT_KEY, customerKey: user.id });
  } catch (error) { return errorResponse(error); }
}
