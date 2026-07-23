import "server-only";
import { cookies } from "next/headers";
import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "./prisma";
import type { SerializedUser } from "./types";

const COOKIE_NAME = "commons_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BCRYPT_ROUNDS = 10;

const SECRET = process.env.SESSION_SECRET;
if (!SECRET && process.env.NODE_ENV === "production") {
  throw new Error("SESSION_SECRET must be set in production");
}

// HMAC the opaque token before storing it, so a leaked DB can't be used to
// mint valid cookies.
function hashToken(token: string): string {
  return createHmac("sha256", SECRET ?? "dev-insecure-secret")
    .update(token)
    .digest("hex");
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => {});
  }
  jar.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return session.user;
}

export function toSerializedUser(user: {
  id: string;
  displayName: string;
  avatarColor: string;
}): SerializedUser {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
  };
}
