import { NextResponse } from "next/server";
import { aiAvailable, paymentAvailable } from "@/lib/state";
export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json({ status: "ok", ai: aiAvailable() ? "configured" : "demo", payment: paymentAvailable() ? "configured" : "unavailable" });
}
