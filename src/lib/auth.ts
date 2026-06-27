import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { UserRole } from "@prisma/client";

const SESSION_COOKIE = "titiabar_session";
const MASTER_LIST_UNLOCK_COOKIE = "titiabar_master_list_unlock";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionUser {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  branchId: string | null;
  branchName?: string | null;
}

function getSecret() {
  const secret =
    process.env.SESSION_SECRET ||
    (process.env.NODE_ENV === "development"
      ? "titiabar-dev-secret-key-local-only"
      : undefined);
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must be set and at least 16 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return digits;
  return digits.slice(-10);
}

export async function findUserByLogin(login: string) {
  const trimmed = login.trim();
  if (!trimmed) return null;

  const digits = normalizePhone(trimmed);

  if (digits.length >= 10) {
    const byPhone = await prisma.user.findUnique({
      where: { phone: digits },
      include: { branch: true },
    });
    if (byPhone?.isActive) return byPhone;
  }

  const byUserName = await prisma.user.findFirst({
    where: {
      name: { equals: trimmed, mode: "insensitive" },
      isActive: true,
    },
    include: { branch: true },
  });
  if (byUserName) return byUserName;

  const byBranchName = await prisma.user.findFirst({
    where: {
      role: "BRANCH_USER",
      isActive: true,
      branch: {
        name: { equals: trimmed, mode: "insensitive" },
        isActive: true,
      },
    },
    include: { branch: true },
  });
  if (byBranchName) return byBranchName;

  if (digits.length >= 10) {
    const byBranchPhone = await prisma.user.findFirst({
      where: {
        role: "BRANCH_USER",
        isActive: true,
        branch: {
          phone: digits,
          isActive: true,
        },
      },
      include: { branch: true },
    });
    if (byBranchPhone) return byBranchPhone;
  }

  return null;
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    branchId: user.branchId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(MASTER_LIST_UNLOCK_COOKIE);
}

export async function hasMasterListAccess(user: SessionUser): Promise<boolean> {
  if (user.role === "ADMIN") return true;

  const cookieStore = await cookies();
  const token = cookieStore.get(MASTER_LIST_UNLOCK_COOKIE)?.value;
  if (!token) return false;

  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

async function setMasterListUnlockCookie() {
  const token = await new SignJWT({ masterList: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(MASTER_LIST_UNLOCK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function unlockMasterListWithAdminPassword(
  password: string
): Promise<boolean> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { passwordHash: true },
  });

  for (const admin of admins) {
    if (await verifyPassword(password, admin.passwordHash)) {
      await setMasterListUnlockCookie();
      return true;
    }
  }

  return false;
}

export const getSession = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const user: SessionUser = {
      id: payload.id as string,
      name: payload.name as string,
      phone: payload.phone as string,
      role: payload.role as UserRole,
      branchId: (payload.branchId as string) || null,
    };

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { branch: true },
    });

    if (!dbUser || !dbUser.isActive) return null;

    return {
      ...user,
      name: dbUser.name,
      branchId: dbUser.branchId,
      branchName: dbUser.branch?.name ?? null,
    };
  } catch {
    return null;
  }
});

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthError("Unauthorized", 401);
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireAuth();
  if (session.role !== "ADMIN") throw new AuthError("Admin access required", 403);
  return session;
}

export async function requireMasterListAccess(): Promise<SessionUser> {
  const session = await requireAuth();
  if (await hasMasterListAccess(session)) return session;
  throw new AuthError("Admin password required for Master List", 403);
}

export function assertBranchAccess(user: SessionUser, branchId: string) {
  if (user.role === "ADMIN") return;
  if (user.branchId !== branchId) {
    throw new AuthError("Branch access denied", 403);
  }
}

export function resolveBranchId(user: SessionUser, requestedBranchId?: string | null): string {
  if (user.role === "ADMIN") {
    if (!requestedBranchId) throw new AuthError("branchId is required for admin", 400);
    return requestedBranchId;
  }
  if (!user.branchId) throw new AuthError("User has no assigned branch", 403);
  return user.branchId;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
