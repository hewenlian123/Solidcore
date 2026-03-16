import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const body = await request.json();
    const variantId = String(body.variantId ?? "").trim();
    const marginPct = body.marginPct != null ? Number(body.marginPct) : null;
    if (!variantId) return NextResponse.json({ error: "variantId required." }, { status: 400 });

    if (marginPct === null || !Number.isFinite(marginPct) || marginPct < 0) {
      await prisma.variantMarginOverride.deleteMany({ where: { variantId } });
      return NextResponse.json({ data: { variantId, marginPctOverride: null } });
    }
    await prisma.variantMarginOverride.upsert({
      where: { variantId },
      create: { variantId, marginPct },
      update: { marginPct },
    });
    return NextResponse.json({ data: { variantId, marginPctOverride: marginPct } });
  } catch (err) {
    console.error("POST /api/price-management/margin/variant error:", err);
    return NextResponse.json({ error: "Failed to save variant margin." }, { status: 500 });
  }
}
