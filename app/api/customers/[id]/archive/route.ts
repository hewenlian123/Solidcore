import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
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

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN"])) return deny();
    const user = getRequestUser(request);
    const { id } = await params;
    const body = await request.json();
    const action = String(body?.action ?? "")
      .trim()
      .toUpperCase();
    const reason = String(body?.reason ?? "").trim();

    if (action !== "ARCHIVE" && action !== "RESTORE") {
      return NextResponse.json(
        { error: "Choose archive or restore." },
        { status: 400 },
      );
    }
    if (reason.length < 8) {
      return NextResponse.json(
        { error: "Provide a clear reason of at least 8 characters." },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "customers" WHERE id = ${id} FOR UPDATE`,
        );
        const customer = await tx.salesCustomer.findUnique({
          where: { id },
          select: {
            id: true,
            archivedAt: true,
            mergedIntoId: true,
          },
        });
        if (!customer) {
          return { status: 404 as const, error: "Customer not found." };
        }
        if (customer.mergedIntoId) {
          return {
            status: 409 as const,
            error: "Merged customer records cannot be restored or archived.",
            code: "CUSTOMER_MERGED",
            redirectCustomerId: customer.mergedIntoId,
          };
        }

        const archive = action === "ARCHIVE";
        if (archive === Boolean(customer.archivedAt)) {
          return {
            status: 200 as const,
            data: customer,
            idempotent: true,
          };
        }

        const updated = await tx.salesCustomer.update({
          where: { id },
          data: { archivedAt: archive ? new Date() : null },
          select: { id: true, archivedAt: true },
        });
        await tx.customerLifecycleEvent.create({
          data: {
            customerId: id,
            action,
            reason,
            actor: user?.name || role,
          },
        });
        return { status: 200 as const, data: updated, idempotent: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    if ("error" in result) {
      return NextResponse.json(result, { status: result.status });
    }
    return NextResponse.json(
      { data: result.data, idempotent: result.idempotent },
      { status: 200 },
    );
  } catch (error) {
    console.error("PATCH /api/customers/[id]/archive error:", error);
    return NextResponse.json(
      { error: "Failed to update customer archive status." },
      { status: 500 },
    );
  }
}
