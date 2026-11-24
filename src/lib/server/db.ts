
import "server-only";

import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// With Prisma 7, prisma.config.ts resolves DATABASE_URL relative to the project
// root — the same directory the app runs from — so the URL is used exactly as
// written (e.g. file:./prisma/dev.db). Rewriting it here would point the app at a
// different file from the one the Prisma CLI creates and migrates.
const runtimeUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

function createPrismaClient() {
  const adapter = new PrismaLibSql(
    {
      url: runtimeUrl,
    },
    {
      timestampFormat: "unixepoch-ms",
    }
  );

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

export const db =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

/** BigInt (DB) → number (engine). Throws if outside the safe-integer range. */
export function n(v: bigint): number;
export function n(v: bigint | null): number | null;
export function n(v: bigint | null | undefined): number | null {
  if (v == null) return null;

  const x = Number(v);

  if (!Number.isSafeInteger(x)) {
    throw new Error("Monetary value exceeds safe range");
  }

  return x;
}

export function big(v: number): bigint;
export function big(v: number | null | undefined): bigint | null;
export function big(v: number | null | undefined): bigint | null {
  if (v == null) return null;

  if (!Number.isSafeInteger(v)) {
    throw new Error(
      "Monetary value must be an integer number of minor units"
    );
  }

  return BigInt(v);
}