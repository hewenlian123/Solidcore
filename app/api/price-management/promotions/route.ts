import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export const dynamic = "force-dynamic";

function promotionStatus(startAt: Date, endAt: Date, enabled: boolean): "active" | "upcoming" | "expired" {
  if (!enabled) return "expired";
  const now = new Date();
  if (now < startAt) return "upcoming";
  if (now > endAt) return "expired";
  return "active";
}

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const list = await prisma.promotion.findMany({
      orderBy: [{ startAt: "desc" }],
    });
    const data = list.map((p) => ({
      id: p.id,
      name: p.name,
      discountType: p.type,
      value: Number(p.value),
      applicableCategory: p.category,
      startAt: p.startAt.toISOString(),
      endAt: p.endAt.toISOString(),
      enabled: p.enabled,
      status: promotionStatus(p.startAt, p.endAt, p.enabled),
      createdAt: p.createdAt?.toISOString() ?? new Date().toISOString(),
    }));
    return NextResponse.json({ data });
  } catch (err) {
    console.error("GET /api/price-management/promotions error:", err);
    return NextResponse.json({ error: "Failed to fetch promotions." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const discountTypeRaw = String(body.discountType ?? "PERCENT").toUpperCase();
    const type = discountTypeRaw === "PERCENT" ? "PERCENTAGE" : discountTypeRaw === "FIXED" ? "FIXED" : "PERCENTAGE";
    const value = Number(body.value);
    const category = body.applicableCategory != null ? String(body.applicableCategory).trim() || null : null;
    const startAt = body.startAt ? new Date(body.startAt) : new Date();
    const endAt = body.endAt ? new Date(body.endAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    if (type !== "FIXED" && type !== "PERCENTAGE") return NextResponse.json({ error: "discountType must be FIXED or PERCENT." }, { status: 400 });
    if (!Number.isFinite(value) || value < 0) return NextResponse.json({ error: "Invalid value." }, { status: 400 });

    const created = await prisma.promotion.create({
      data: {
        name,
        type,
        value,
        category,
        startAt,
        endAt,
        enabled: true,
      },
    });
    return NextResponse.json({
      data: {
        id: created.id,
        name: created.name,
        discountType: created.type,
        value: Number(created.value),
        startAt: created.startAt.toISOString(),
        endAt: created.endAt.toISOString(),
        enabled: created.enabled,
        status: promotionStatus(created.startAt, created.endAt, created.enabled),
      },
    });
  } catch (err) {
    console.error("POST /api/price-management/promotions error:", err);
    return NextResponse.json({ error: "Failed to create promotion." }, { status: 500 });
  }
}
