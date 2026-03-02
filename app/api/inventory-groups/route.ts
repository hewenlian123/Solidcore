import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const data = await prisma.inventoryGroup.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/inventory-groups error:", error);
    return NextResponse.json({ error: "Failed to fetch inventory groups." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const body = await request.json();
    const name = String(body?.name ?? "").trim();
    const description = String(body?.description ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Group name is required." }, { status: 400 });
    }

    const data = await prisma.inventoryGroup.create({
      data: {
        name,
        description: description || null,
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "Group name already exists." }, { status: 409 });
    }
    console.error("POST /api/inventory-groups error:", error);
    return NextResponse.json({ error: "Failed to create inventory group." }, { status: 500 });
  }
}
