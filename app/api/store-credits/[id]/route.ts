import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = { params: Promise<{ id: string }> };

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function appendNote(existing: string | null, note: string) {
  const prefix = existing ? `${existing}\n` : "";
  return `${prefix}${note}`;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    const payload = await request.json();
    const action = String(payload?.action ?? "").toUpperCase();
    const reason = String(payload?.reason ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing store credit id." }, { status: 400 });
    if (!reason) return NextResponse.json({ error: "Reason is required." }, { status: 400 });

    if (action !== "VOID" && action !== "ADJUST") {
      return NextResponse.json({ error: "action must be VOID or ADJUST." }, { status: 400 });
    }

    const data = await prisma.$transaction(async (tx) => {
      const credit = await tx.storeCredit.findUnique({
        where: { id },
        select: { id: true, amount: true, usedAmount: true, status: true, notes: true },
      });
      if (!credit) throw new Error("NOT_FOUND");

      if (action === "VOID") {
        if (credit.status === "VOID") return credit;
        const noteLine = `[${new Date().toISOString()}] void: ${reason}`;
        return tx.storeCredit.update({
          where: { id },
          data: {
            status: "VOID",
            notes: appendNote(credit.notes, noteLine),
          },
        });
      }

      const delta = Number(payload?.delta ?? 0);
      if (!Number.isFinite(delta) || delta === 0) throw new Error("DELTA_INVALID");
      const amount = round2(Number(credit.amount ?? 0));
      const usedAmount = round2(Number(credit.usedAmount ?? 0));
      const nextAmount = round2(amount + delta);
      if (nextAmount < 0) throw new Error("NEGATIVE_AMOUNT");
      if (nextAmount + 0.0001 < usedAmount) throw new Error("BELOW_USED");

      let nextStatus: "OPEN" | "USED" | "VOID" = "OPEN";
      const remaining = round2(nextAmount - usedAmount);
      if (nextAmount <= 0) nextStatus = "VOID";
      else if (remaining <= 0) nextStatus = "USED";

      const noteLine = `[${new Date().toISOString()}] adjust ${delta >= 0 ? "+" : ""}${delta}: ${reason}`;
      return tx.storeCredit.update({
        where: { id },
        data: {
          amount: nextAmount,
          status: nextStatus,
          notes: appendNote(credit.notes, noteLine),
        },
      });
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Store credit not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "DELTA_INVALID") {
      return NextResponse.json({ error: "delta must be a non-zero number." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "NEGATIVE_AMOUNT") {
      return NextResponse.json({ error: "Adjustment cannot make amount negative." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "BELOW_USED") {
      return NextResponse.json(
        { error: "Adjustment cannot reduce amount below already used amount." },
        { status: 400 },
      );
    }
    console.error("PATCH /api/store-credits/[id] error:", error);
    return NextResponse.json({ error: "Failed to update store credit." }, { status: 500 });
  }
}

