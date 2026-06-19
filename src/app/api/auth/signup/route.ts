import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { Prisma, Role } from "@prisma/client";

type NewUser = { id: string; name: string; email: string; role: Role };
type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

const SignupSchema = z
  .object({
    name:            z.string().trim().min(1, "Name is required").max(120),
    email:           z.string().trim().toLowerCase().email("Enter a valid email address"),
    password:        z.string().min(8, "Password must be at least 8 characters").max(200),
    confirmPassword: z.string(),
    role:            z.enum(["CLINICIAN", "OPS_DIRECTOR", "CMIO"]),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApiResponse<NewUser>>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON body" }, { status: 400 });
  }

  const v = SignupSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { ok: false, error: v.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  const { name, email, password, role } = v.data;

  // ── Guard: email must not already be registered ───────────────────
  let existing: { id: string } | null;
  try {
    existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  } catch {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  }
  if (existing) {
    return NextResponse.json(
      { ok: false, error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const user = await db.user.create({
      data: { name, email, role, hashedPassword },
      select: { id: true, name: true, email: true, role: true },
    });
    return NextResponse.json({ ok: true, data: user }, { status: 201 });
  } catch (err) {
    // Unique-constraint race: two requests for the same email at once.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "An account with this email already exists" },
        { status: 409 }
      );
    }
    const msg = err instanceof Error ? err.message : "Failed to create account";
    return NextResponse.json({ ok: false, error: msg }, { status: 503 });
  }
}
