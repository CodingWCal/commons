import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signupSchema } from "@/lib/validations";
import { createSession, hashPassword } from "@/lib/auth";
import { pickAvatarColor } from "@/lib/avatar";

export const runtime = "nodejs";

export async function POST(req: Request) {
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

  const { displayName, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "That email is already registered" },
      { status: 409 },
    );
  }

  const user = await prisma.user.create({
    data: {
      displayName,
      email,
      passwordHash: await hashPassword(password),
      avatarColor: pickAvatarColor(email),
    },
  });

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
