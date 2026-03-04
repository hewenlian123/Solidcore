import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { id } = await params;

    const rows = await prisma.salesReturn.findMany({
      where: {
        salesOrder: { customerId: id },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        createdAt: true,
        status: true,
        creditAmount: true,
        issueStoreCredit: true,
        storeCredit: {
          select: { id: true, amount: true, status: true },
        },
      },
    });

    const data = rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      status: row.status,
      creditAmount: Number(row.storeCredit?.amount ?? row.creditAmount ?? 0),
      issueStoreCredit: row.issueStoreCredit,
      storeCreditId: row.storeCredit?.id ?? null,
      storeCreditStatus: row.storeCredit?.status ?? null,
    }));

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/customers/[id]/returns error:", error);
    return NextResponse.json({ error: "Failed to load customer returns." }, { status: 500 });
  }
}
