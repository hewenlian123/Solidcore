import { NextRequest, NextResponse } from "next/server";
import { COMPANY_SETTINGS } from "@/lib/company-settings";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { getDefaultTaxRate } from "@/lib/settings";

export async function GET(request: NextRequest) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
  const defaultTaxRate = await getDefaultTaxRate(prisma);
  return NextResponse.json({ data: { ...COMPANY_SETTINGS, defaultTaxRate } }, { status: 200 });
}

export async function PUT(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN"])) return deny();
    const payload = await request.json();
    const defaultTaxRate = Number(payload?.defaultTaxRate ?? 0);
    if (!Number.isFinite(defaultTaxRate) || defaultTaxRate < 0) {
      return NextResponse.json({ error: "Default tax rate must be a non-negative number." }, { status: 400 });
    }
    const updated = await prisma.settings.upsert({
      where: { id: "default" },
      update: { defaultTaxRate },
      create: { id: "default", defaultTaxRate },
      select: { defaultTaxRate: true, updatedAt: true },
    });
    return NextResponse.json(
      { data: { defaultTaxRate: Number(updated.defaultTaxRate), updatedAt: updated.updatedAt } },
      { status: 200 },
    );
  } catch (error) {
    console.error("PUT /api/settings/company error:", error);
    return NextResponse.json({ error: "Failed to update company settings." }, { status: 500 });
  }
}
