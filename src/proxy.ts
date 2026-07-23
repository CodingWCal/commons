import { NextResponse, type NextRequest } from "next/server";

// Next 16 "proxy" convention (formerly middleware). Lightweight edge gate:
// bounce unauthenticated visitors to /login before a page renders. This only
// checks for the presence of the session cookie for a fast redirect — real
// session validation happens server-side in pages and API routes (lib/auth.ts).
// Auth pages themselves redirect already-signed-in users home via their own
// server check, so we don't do the reverse here (that would loop when a
// stale-but-present cookie fails validation).
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("commons_session");
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  if (!hasSession && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except API routes, Next internals, and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
