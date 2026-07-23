import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signupSchema } from "@/lib/validations";
import { createSession, hashPassword } from "@/lib/auth";
import { pickAvatarColor } from "@/lib/avatar";
import { assertSameOrigin } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // Optional invite gate (TICKET-020): when COMMONS_INVITE_CODE is set, signup
  // requires a matching code. Unset = open signup.
  const requiredCode = process.env.COMMONS_INVITE_CODE;
  if (requiredCode) {
    const provided = (json as { inviteCode?: unknown })?.inviteCode;
    if (provided !== requiredCode) {
      return NextResponse.json(
        { error: "A valid invite code is required to join." },
        { status: 403 },
      );
    }
  }

  const { displayName, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "That email is already registered" },
      { status: 409 },
    );
  }

  // The first person to join becomes the workspace admin (facilitator).
  // Wrap count+create in a transaction so two racing first-signups can't both
  // be granted admin.
  const passwordHash = await hashPassword(password);
  const user = await prisma.$transaction(async (tx) => {
    const isFirstUser = (await tx.user.count()) === 0;
    return tx.user.create({
      data: {
        displayName,
        email,
        passwordHash,
        avatarColor: pickAvatarColor(email),
        role: isFirstUser ? "admin" : "member",
      },
    });
  });

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
