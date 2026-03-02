import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) {
      return deny();
    }

    const { searchParams } = new URL(request.url);
    const q = String(searchParams.get("q") ?? "").trim();

    const customers = await prisma.salesCustomer.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q } },
              { phone: { contains: q } },
              { email: { contains: q } },
              { address: { contains: q } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        notes: true,
        createdAt: true,
      },
      take: 30,
    });

    return NextResponse.json(
      {
        data: customers.map((item) => ({
          id: item.id,
          name: item.name,
          phone: item.phone,
          email: item.email,
          installAddress: item.address,
          notes: item.notes,
          createdAt: item.createdAt,
        })),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/customers error:", error);
    return NextResponse.json({ error: "Failed to fetch customer data." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) {
      return deny();
    }

    const body = await request.json();
    const name = String(body?.name ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const email = String(body?.email ?? "").trim();
    const installAddress = String(body?.installAddress ?? "").trim();
    const notes = String(body?.notes ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
    }

    const created = await prisma.salesCustomer.create({
      data: {
        name,
        phone: phone || null,
        email: email || null,
        address: installAddress || null,
        notes: notes || null,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        notes: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        data: {
          id: created.id,
          name: created.name,
          phone: created.phone,
          email: created.email,
          installAddress: created.address,
          notes: created.notes,
          createdAt: created.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/customers error:", error);
    return NextResponse.json({ error: "Failed to create customer." }, { status: 500 });
  }
}
