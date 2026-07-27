import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { getWritableCustomer } from "@/lib/customers/customer-lifecycle";

type Params = {
  params: Promise<{ id: string; followUpId: string }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { id, followUpId } = await params;
    const body = await request.json();
    const action = String(body?.action ?? "")
      .trim()
      .toUpperCase();
    const completionNote = String(body?.completionNote ?? "").trim();
    if (!["COMPLETE", "CANCEL"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid Follow-Up action." },
        { status: 400 },
      );
    }
    if (action === "COMPLETE" && !completionNote) {
      return NextResponse.json(
        { error: "Completion outcome is required." },
        { status: 400 },
      );
    }
    const writable = await getWritableCustomer(prisma, id);
    if (!writable.ok) {
      return NextResponse.json(writable, { status: writable.status });
    }

    const existing = await prisma.customerFollowUp.findFirst({
      where: { id: followUpId, customerId: id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Follow-Up not found." },
        { status: 404 },
      );
    }
    if (existing.status !== "OPEN") {
      return NextResponse.json(
        { data: existing, idempotent: true },
        { status: 200 },
      );
    }

    const updated = await prisma.customerFollowUp.update({
      where: { id: followUpId },
      data: {
        status: action === "COMPLETE" ? "COMPLETED" : "CANCELLED",
        completedAt: new Date(),
        completionNote: completionNote || null,
      },
    });
    return NextResponse.json(
      { data: updated, idempotent: false },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      "PATCH /api/customers/[id]/follow-ups/[followUpId] error:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to update Follow-Up." },
      { status: 500 },
    );
  }
}
