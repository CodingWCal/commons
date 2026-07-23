import { NextResponse } from "next/server";
import {
  destroyAllSessions,
  destroySession,
  getCurrentUser,
} from "@/lib/auth";
import { assertSameOrigin } from "@/lib/security";

export const runtime = "nodejs";

// Body: { scope?: "current" | "all" }. "all" signs out every device (TICKET-004).
export async function POST(req: Request) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;

  let scope: "current" | "all" = "current";
  try {
    const body = (await req.json()) as { scope?: unknown };
    if (body?.scope === "all") scope = "all";
  } catch {
    // No/!JSON body — default to current-session logout.
  }

  if (scope === "all") {
    const user = await getCurrentUser();
    if (user) {
      await destroyAllSessions(user.id);
      return NextResponse.json({ ok: true, scope: "all" });
    }
  }

  await destroySession();
  return NextResponse.json({ ok: true, scope: "current" });
}
