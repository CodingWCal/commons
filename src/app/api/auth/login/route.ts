import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations";
import { createSession, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";

// Precomputed hash so the "no such user" path spends roughly the same time as
// a real password check — mitigates account-enumeration via timing.
const DUMMY_HASH = bcrypt.hashSync("commons-timing-equalizer", 10);

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  const invalid = () =>
    NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    return invalid();
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return invalid();

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
