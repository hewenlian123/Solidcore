import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { id } = await params;

    const customer = await prisma.salesCustomer.findUnique({
      where: { id },
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
    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    return NextResponse.json(
      {
        data: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          installAddress: customer.address,
          notes: customer.notes,
          createdAt: customer.createdAt,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/customers/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch customer." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { id } = await params;
    const body = await request.json();

    const name = String(body?.name ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const email = String(body?.email ?? "").trim();
    const installAddress = String(body?.installAddress ?? "").trim();
    const notes = String(body?.notes ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
    }

    const updated = await prisma.salesCustomer.update({
      where: { id },
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
          id: updated.id,
          name: updated.name,
          phone: updated.phone,
          email: updated.email,
          installAddress: updated.address,
          notes: updated.notes,
          createdAt: updated.createdAt,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("PATCH /api/customers/[id] error:", error);
    return NextResponse.json({ error: "Failed to update customer." }, { status: 500 });
  }
}
