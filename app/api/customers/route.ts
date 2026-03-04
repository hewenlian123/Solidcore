import { NextRequest, NextResponse } from "next/server";
import { SalesCustomerType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { getDefaultTaxRate } from "@/lib/settings";

function normalizeCustomerType(value: unknown): SalesCustomerType | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "RESIDENTIAL" || normalized === "COMMERCIAL" || normalized === "CONTRACTOR") {
    return normalized as SalesCustomerType;
  }
  return null;
}

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
              { billingAddress: { contains: q } },
              { city: { contains: q } },
              { state: { contains: q } },
              { zipCode: { contains: q } },
              { companyName: { contains: q } },
              { referredBy: { contains: q } },
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
        billingAddress: true,
        city: true,
        state: true,
        zipCode: true,
        companyName: true,
        customerType: true,
        taxExempt: true,
        taxRate: true,
        referredBy: true,
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
          billingAddress: item.billingAddress,
          city: item.city,
          state: item.state,
          zipCode: item.zipCode,
          companyName: item.companyName,
          customerType: item.customerType,
          taxExempt: item.taxExempt,
          taxRate: item.taxRate != null ? Number(item.taxRate) : null,
          referredBy: item.referredBy,
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
    const billingAddress = String(body?.billingAddress ?? "").trim();
    const city = String(body?.city ?? "").trim();
    const state = String(body?.state ?? "").trim();
    const zipCode = String(body?.zipCode ?? "").trim();
    const companyName = String(body?.companyName ?? "").trim();
    const customerType = normalizeCustomerType(body?.customerType);
    const taxExempt = Boolean(body?.taxExempt ?? false);
    const parsedTaxRate =
      body?.taxRate === null || body?.taxRate === undefined || body?.taxRate === ""
        ? null
        : Number(body?.taxRate);
    const referredBy = String(body?.referredBy ?? "").trim();
    const notes = String(body?.notes ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
    }
    if (body?.customerType !== undefined && body?.customerType !== null && !customerType) {
      return NextResponse.json({ error: "Invalid customer type." }, { status: 400 });
    }
    if (parsedTaxRate !== null && (!Number.isFinite(parsedTaxRate) || parsedTaxRate < 0)) {
      return NextResponse.json({ error: "Tax rate must be a non-negative number." }, { status: 400 });
    }

    const defaultTaxRate = await getDefaultTaxRate(prisma);
    const resolvedTaxRate = taxExempt ? null : parsedTaxRate ?? defaultTaxRate;

    const created = await prisma.salesCustomer.create({
      data: {
        name,
        phone: phone || null,
        email: email || null,
        address: installAddress || null,
        billingAddress: billingAddress || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
        companyName: companyName || null,
        customerType,
        taxExempt,
        taxRate: resolvedTaxRate,
        referredBy: referredBy || null,
        notes: notes || null,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        billingAddress: true,
        city: true,
        state: true,
        zipCode: true,
        companyName: true,
        customerType: true,
        taxExempt: true,
        taxRate: true,
        referredBy: true,
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
          billingAddress: created.billingAddress,
          city: created.city,
          state: created.state,
          zipCode: created.zipCode,
          companyName: created.companyName,
          customerType: created.customerType,
          taxExempt: created.taxExempt,
          taxRate: created.taxRate != null ? Number(created.taxRate) : null,
          referredBy: created.referredBy,
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
