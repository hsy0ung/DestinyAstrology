import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { sessionState } from "@/lib/state";
import { errorResponse } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(req: NextRequest) {
  try { return NextResponse.json(sessionState(currentUser(req)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
