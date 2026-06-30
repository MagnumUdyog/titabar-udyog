import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { AuthError } from "./auth";
import { StockError } from "./stock";
import { ZodError } from "zod";
import { formatZodError } from "./branch-validation";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function prismaUniqueConstraintMessage(
  error: Prisma.PrismaClientKnownRequestError
): string | null {
  if (error.code !== "P2002") return null;

  const target = error.meta?.target;
  const fields = Array.isArray(target)
    ? target.map(String)
    : [String(target ?? "")];

  if (fields.some((field) => field.includes("phone"))) {
    return "This phone number is already in use. Please use a different number.";
  }
  if (fields.some((field) => field.includes("code"))) {
    return "This branch code is already in use. Please use a different code.";
  }
  if (fields.some((field) => field.includes("orderNumber"))) {
    return "Order number conflict — please try submitting again.";
  }

  return "This value is already in use. Please use a different one.";
}

export function handleApiError(error: unknown) {
  if (error instanceof AuthError) {
    return jsonError(error.message, error.status);
  }
  if (error instanceof StockError) {
    return jsonError(error.message, 400);
  }
  if (error instanceof ZodError) {
    return jsonError(formatZodError(error), 400, { details: error.flatten() });
  }

  if (
    error instanceof Error &&
    error.message.includes("SESSION_SECRET must be set")
  ) {
    return jsonError(
      "Server misconfigured: SESSION_SECRET is missing. Add it in your hosting environment variables.",
      503
    );
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const databaseMissing =
    !databaseUrl ||
    (!databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://"));

  if (databaseMissing) {
    return jsonError(
      "Database not configured. Set DATABASE_URL in .env.local, then run: npm run db:push && npm run db:seed",
      503
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (["P1001", "P1002", "P1008", "P1017", "P2024"].includes(error.code)) {
      console.error("Database connection error:", error.code, error.message);
      return jsonError("Database temporarily unavailable. Please try again.", 503);
    }
    const uniqueMessage = prismaUniqueConstraintMessage(error);
    if (uniqueMessage) {
      return jsonError(uniqueMessage, 400);
    }
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Error &&
      (error.message.includes("Can't reach database server") ||
        error.message.includes("Connection pool timeout") ||
        error.message.includes("Too many connections")))
  ) {
    console.error("Prisma connection error:", error);
    const staleClient =
      error instanceof Error &&
      error.message.includes("must start with the protocol `postgresql://`");
    if (staleClient && process.env.NODE_ENV !== "production") {
      return jsonError(
        "Database connection is stale after changing DATABASE_URL. Stop and restart `npm run dev`, then try again.",
        503
      );
    }
    return jsonError("Database temporarily unavailable. Please try again.", 503);
  }

  console.error(error);
  return jsonError("Internal server error", 500);
}

export function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}
