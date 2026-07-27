import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  deny,
  getRequestRole,
  getRequestUser,
  hasOneOf,
} from "@/lib/server-role";
import { getWritableCustomer } from "@/lib/customers/customer-lifecycle";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
  const { id } = await params;
  const data = await prisma.customerFollowUp.findMany({
    where: { customerId: id },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ data }, { status: 200 });
}

export async function POST(request: NextRequest, { params }: Params) {
  let creationKey = "";
  let customerId = "";
  let requestedOwner = "";
  let requestedAction = "";
  let requestedDueAt: Date | null = null;
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const user = getRequestUser(request);
    const { id } = await params;
    customerId = id;
    const body = await request.json();
    const owner = String(body?.owner ?? "").trim();
    const nextAction = String(body?.nextAction ?? "").trim();
    const dueAt = new Date(String(body?.dueAt ?? ""));
    creationKey = String(
      request.headers.get("idempotency-key") ?? body?.creationKey ?? "",
    ).trim();
    requestedOwner = owner;
    requestedAction = nextAction;
    requestedDueAt = dueAt;

    if (!owner || !nextAction || Number.isNaN(dueAt.getTime())) {
      return NextResponse.json(
        { error: "Follow-Up owner, due date, and next action are required." },
        { status: 400 },
      );
    }
    if (creationKey.length > 255) {
      return NextResponse.json(
        { error: "Follow-Up request identity is too long." },
        { status: 400 },
      );
    }
    const writable = await getWritableCustomer(prisma, id);
    if (!writable.ok) {
      return NextResponse.json(writable, { status: writable.status });
    }
    if (creationKey) {
      const existing = await prisma.customerFollowUp.findUnique({
        where: { creationKey },
      });
      if (existing) {
        if (
          existing.customerId !== id ||
          existing.owner !== owner ||
          existing.nextAction !== nextAction ||
          existing.dueAt.getTime() !== dueAt.getTime()
        ) {
          return NextResponse.json(
            {
              error:
                "This Follow-Up request was already used for different details.",
              existingFollowUpId: existing.id,
            },
            { status: 409 },
          );
        }
        return NextResponse.json(
          { data: existing, idempotent: true },
          { status: 200 },
        );
      }
    }

    const created = await prisma.customerFollowUp.create({
      data: {
        customerId: id,
        owner,
        dueAt,
        nextAction,
        createdBy: user?.name || role,
        creationKey: creationKey || null,
      },
    });
    return NextResponse.json(
      { data: created, idempotent: false },
      { status: 201 },
    );
  } catch (error) {
    if (
      creationKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.customerFollowUp.findUnique({
        where: { creationKey },
      });
      if (
        existing &&
        requestedDueAt &&
        existing.customerId === customerId &&
        existing.owner === requestedOwner &&
        existing.nextAction === requestedAction &&
        existing.dueAt.getTime() === requestedDueAt.getTime()
      ) {
        return NextResponse.json(
          { data: existing, idempotent: true },
          { status: 200 },
        );
      }
      return NextResponse.json(
        {
          error:
            "This Follow-Up request was already used for different details.",
          existingFollowUpId: existing?.id ?? null,
        },
        { status: 409 },
      );
    }
    console.error("POST /api/customers/[id]/follow-ups error:", error);
    return NextResponse.json(
      { error: "Failed to create Follow-Up." },
      { status: 500 },
    );
  }
}
