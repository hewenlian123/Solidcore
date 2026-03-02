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
    const notes = await prisma.customerNote.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        note: true,
        createdBy: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ data: notes }, { status: 200 });
  } catch (error) {
    console.error("GET /api/customers/[id]/notes error:", error);
    return NextResponse.json({ error: "Failed to fetch customer notes." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { id } = await params;
    const body = await request.json();
    const note = String(body?.note ?? "").trim();
    if (!note) {
      return NextResponse.json({ error: "Note is required." }, { status: 400 });
    }

    const created = await prisma.customerNote.create({
      data: {
        customerId: id,
        note,
        createdBy: role,
      },
      select: {
        id: true,
        note: true,
        createdBy: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/customers/[id]/notes error:", error);
    return NextResponse.json({ error: "Failed to create note." }, { status: 500 });
  }
}
