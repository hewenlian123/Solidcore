import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const enabled = body.enabled;

    const existing = await prisma.promotion.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Promotion not found." }, { status: 404 });

    if (typeof enabled !== "boolean") return NextResponse.json({ error: "enabled must be boolean." }, { status: 400 });

    const updated = await prisma.promotion.update({
      where: { id },
      data: { enabled },
    });
    const now = new Date();
    const status = !updated.enabled ? "expired" : now < updated.startAt ? "upcoming" : now > updated.endAt ? "expired" : "active";
    return NextResponse.json({
      data: {
        id: updated.id,
        name: updated.name,
        enabled: updated.enabled,
        status,
      },
    });
  } catch (err) {
    console.error("PATCH /api/price-management/promotions/[id] error:", err);
    return NextResponse.json({ error: "Failed to update promotion." }, { status: 500 });
  }
}
