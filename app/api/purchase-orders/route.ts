import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDate(value: unknown, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const data = await prisma.purchaseOrder.findMany({
      include: {
        supplier: { select: { id: true, name: true, contactName: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/purchase-orders error:", error);
    return NextResponse.json({ error: "Failed to fetch purchase orders." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const payload = await request.json();
    const poNumber = String(payload.poNumber ?? "").trim();
    const supplierId = String(payload.supplierId ?? "").trim();
    if (!poNumber) {
      return NextResponse.json({ error: "PO number is required." }, { status: 400 });
    }
    if (!supplierId) {
      return NextResponse.json({ error: "Supplier is required." }, { status: 400 });
    }

    const data = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierId,
        status: String(payload.status ?? "ORDERED"),
        orderDate: toDate(payload.orderDate, new Date()),
        expectedArrival: payload.expectedArrival ? toDate(payload.expectedArrival, new Date()) : null,
        totalCost: toNumber(payload.totalCost, 0),
        notes: payload.notes ? String(payload.notes) : null,
      },
      include: {
        supplier: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/purchase-orders error:", error);
    return NextResponse.json({ error: "Failed to create purchase order." }, { status: 500 });
  }
}

