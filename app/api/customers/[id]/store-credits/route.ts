import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { id } = await params;

    const [rows] = await Promise.all([
      prisma.storeCredit.findMany({
        where: { customerId: id, status: "OPEN" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          amount: true,
          usedAmount: true,
          status: true,
          returnId: true,
        },
      }),
    ]);

    const mappedCredits = rows
      .map((row) => {
        const amount = Number(row.amount ?? 0);
        const usedAmount = Number(row.usedAmount ?? 0);
        const remainingAmount = Math.max(amount - usedAmount, 0);
        return {
          id: row.id,
          createdAt: row.createdAt,
          amount,
          usedAmount,
          remainingAmount,
          status: row.status,
          returnId: row.returnId,
        };
      })
      .filter((row) => row.remainingAmount > 0);
    const totalOpenCredit = mappedCredits.reduce((sum, row) => sum + row.remainingAmount, 0);

    return NextResponse.json(
      {
        data: {
          totalOpenCredit,
          credits: mappedCredits,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/customers/[id]/store-credits error:", error);
    return NextResponse.json({ error: "Failed to load customer store credits." }, { status: 500 });
  }
}
