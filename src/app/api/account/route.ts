import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteAccount } from "@/lib/db";
import { requireUser, removeSession } from "@/lib/auth";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = requireUser(req);
    z.object({ confirmation: z.literal("DELETE") }).parse(await readJson(req));
    deleteAccount(user.id);
    const res = NextResponse.json({ ok: true }); removeSession(req, res); return res;
  } catch (error) { return errorResponse(error); }
}
