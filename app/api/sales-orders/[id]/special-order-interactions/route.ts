import { NextRequest, NextResponse } from "next/server";
import { Prisma, SpecialOrderCommunicationState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  deny,
  getRequestRole,
  getRequestUser,
  hasOneOf,
} from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

const STATES = [
  "PREPARED",
  "LOGGED",
  "SENT",
  "DELIVERED",
  "CONFIRMED",
] as const;
const CHANNELS = ["PHONE", "EMAIL", "IN_PERSON", "OTHER"] as const;

export async function GET(request: NextRequest, { params }: Params) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
  const { id } = await params;
  const order = await prisma.salesOrder.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!order) {
    return NextResponse.json(
      { error: "Sales order not found." },
      { status: 404 },
    );
  }
  const data = await prisma.specialOrderInteraction.findMany({
    where: { salesOrderId: id },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
  });
  return NextResponse.json({ data }, { status: 200 });
}

export async function POST(request: NextRequest, { params }: Params) {
  let creationKey = "";
  let requestedOrderId = "";
  let requestedState = "";
  let requestedChannel = "";
  let requestedSummary = "";
  let requestedEvidence: string | null = null;
  let requestedOccurredAt: Date | null = null;
  let occurredAtWasProvided = false;
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const user = getRequestUser(request);
    if (!user) return deny();
    const { id } = await params;
    requestedOrderId = id;
    const payload = await request.json();
    const state = String(payload?.state ?? "LOGGED")
      .trim()
      .toUpperCase();
    const channel = String(payload?.channel ?? "")
      .trim()
      .toUpperCase();
    const summary = String(payload?.summary ?? "").trim();
    const evidenceReference =
      String(payload?.evidenceReference ?? "").trim() || null;
    occurredAtWasProvided = Boolean(payload?.occurredAt);
    const occurredAt = occurredAtWasProvided
      ? new Date(String(payload.occurredAt))
      : new Date();
    creationKey = String(
      request.headers.get("idempotency-key") ?? payload?.creationKey ?? "",
    ).trim();
    requestedState = state;
    requestedChannel = channel;
    requestedSummary = summary;
    requestedEvidence = evidenceReference;
    requestedOccurredAt = occurredAt;

    if (!STATES.includes(state as (typeof STATES)[number])) {
      return NextResponse.json(
        { error: "Invalid communication state." },
        { status: 400 },
      );
    }
    if (!CHANNELS.includes(channel as (typeof CHANNELS)[number])) {
      return NextResponse.json(
        { error: "Communication channel is required." },
        { status: 400 },
      );
    }
    if (!summary) {
      return NextResponse.json(
        { error: "Interaction summary is required." },
        { status: 400 },
      );
    }
    if (Number.isNaN(occurredAt.getTime())) {
      return NextResponse.json(
        { error: "Interaction date/time is invalid." },
        { status: 400 },
      );
    }
    if (
      ["SENT", "DELIVERED", "CONFIRMED"].includes(state) &&
      !evidenceReference
    ) {
      return NextResponse.json(
        {
          error: `${state} requires an external message, delivery, or confirmation evidence reference.`,
        },
        { status: 400 },
      );
    }
    if (creationKey.length > 255) {
      return NextResponse.json(
        { error: "Interaction request identity is too long." },
        { status: 400 },
      );
    }

    const order = await prisma.salesOrder.findUnique({
      where: { id },
      select: {
        id: true,
        specialOrder: true,
        items: {
          where: { isSpecialOrder: true },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!order) {
      return NextResponse.json(
        { error: "Sales order not found." },
        { status: 404 },
      );
    }
    if (!order.specialOrder && order.items.length === 0) {
      return NextResponse.json(
        { error: "Interaction log is limited to Special Order context." },
        { status: 409 },
      );
    }

    if (creationKey) {
      const existing = await prisma.specialOrderInteraction.findUnique({
        where: { creationKey },
      });
      if (existing) {
        const sameRequest =
          existing.salesOrderId === id &&
          existing.state === state &&
          existing.channel === channel &&
          existing.summary === summary &&
          existing.evidenceReference === evidenceReference &&
          (!occurredAtWasProvided ||
            existing.occurredAt.getTime() === occurredAt.getTime());
        if (!sameRequest) {
          return NextResponse.json(
            {
              error:
                "This interaction request identity was already used for different details.",
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

    const data = await prisma.specialOrderInteraction.create({
      data: {
        salesOrderId: id,
        state: state as SpecialOrderCommunicationState,
        channel,
        summary,
        evidenceReference,
        actor: `${user.name} (${user.userId})`,
        occurredAt,
        creationKey: creationKey || null,
      },
    });
    return NextResponse.json({ data, idempotent: false }, { status: 201 });
  } catch (error) {
    if (
      creationKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.specialOrderInteraction.findUnique({
        where: { creationKey },
      });
      if (
        existing &&
        existing.salesOrderId === requestedOrderId &&
        existing.state === requestedState &&
        existing.channel === requestedChannel &&
        existing.summary === requestedSummary &&
        existing.evidenceReference === requestedEvidence &&
        (!occurredAtWasProvided ||
          (requestedOccurredAt &&
            existing.occurredAt.getTime() === requestedOccurredAt.getTime()))
      ) {
        return NextResponse.json(
          { data: existing, idempotent: true },
          { status: 200 },
        );
      }
      return NextResponse.json(
        {
          error:
            "This interaction request identity was already used for different details.",
        },
        { status: 409 },
      );
    }
    console.error(
      "POST /api/sales-orders/[id]/special-order-interactions error:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to record Special Order interaction." },
      { status: 500 },
    );
  }
}
