import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { searchParams } = new URL(request.url);
    const q = String(searchParams.get("q") ?? "").trim();

    const data = await prisma.salesCustomer.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q } },
              { phone: { contains: q } },
              { email: { contains: q } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/sales-orders/customers error:", error);
    return NextResponse.json({ error: "Failed to fetch customers." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const payload = await request.json();
    if (!payload.name) {
      return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
    }
    const data = await prisma.salesCustomer.create({
      data: {
        name: String(payload.name),
        phone: payload.phone ? String(payload.phone) : null,
        email: payload.email ? String(payload.email) : null,
        address: payload.address ? String(payload.address) : null,
        notes: payload.notes ? String(payload.notes) : null,
      },
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/sales-orders/customers error:", error);
    return NextResponse.json({ error: "Failed to create customer." }, { status: 500 });
  }
}
