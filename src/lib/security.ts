import { NextResponse } from "next/server";

// CSRF defense for cookie-authenticated mutations (TICKET-003).
//
// Because auth rides in a cookie the browser attaches automatically, a request
// forged by another site could act as a logged-in user. Browsers set the
// `Origin` header on state-changing requests, so we require it to match the
// host being served. A forged cross-site request carries a foreign Origin and
// is rejected with 403. This complements the cookie's `SameSite=Lax` flag.
//
// Returns a 403 response to short-circuit with, or null when the request is
// same-origin and may proceed.
export function assertSameOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  if (!origin || !host) {
    return NextResponse.json(
      { error: "Missing origin on a state-changing request" },
      { status: 403 },
    );
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  if (originHost !== host) {
    return NextResponse.json(
      { error: "Cross-origin request blocked" },
      { status: 403 },
    );
  }

  return null;
}
