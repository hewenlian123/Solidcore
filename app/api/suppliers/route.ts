import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const data = await prisma.supplier.findMany({
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/suppliers error:", error);
    return NextResponse.json({ error: "Failed to fetch suppliers." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN"])) return deny();

    const body = await request.json();
    const name = String(body?.name ?? "").trim();
    const contactName = String(body?.contactName ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const category = String(body?.category ?? "").trim();

    if (!name || !contactName || !phone || !category) {
      return NextResponse.json({ error: "Please complete all supplier fields." }, { status: 400 });
    }

    const data = await prisma.supplier.create({
      data: { name, contactName, phone, category },
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/suppliers error:", error);
    return NextResponse.json({ error: "Failed to create supplier." }, { status: 500 });
  }
}
