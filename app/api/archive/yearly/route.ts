import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN"])) return deny();

    const body = await request.json();
    const year = Number(body?.year);
    if (Number.isNaN(year) || year < 2000) {
      return NextResponse.json({ error: "Invalid year parameter." }, { status: 400 });
    }

    const cutoff = new Date(year, 0, 1);
    const result = await prisma.order.updateMany({
      where: {
        archivedAt: null,
        completedAt: { lt: cutoff },
      },
      data: {
        archivedAt: new Date(),
      },
    });

    return NextResponse.json({ data: { archivedCount: result.count } }, { status: 200 });
  } catch (error) {
    console.error("POST /api/archive/yearly error:", error);
    return NextResponse.json({ error: "Year-end rollover failed。" }, { status: 500 });
  }
}
