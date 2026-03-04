import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const data = await prisma.appUser.findMany({
      where: { role: "SALES" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/sales-orders/salespeople error:", error);
    return NextResponse.json({ error: "Failed to fetch salespeople." }, { status: 500 });
  }
}
