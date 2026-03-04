import { NextRequest, NextResponse } from "next/server";
import { SalesCustomerType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { getDefaultTaxRate } from "@/lib/settings";

type Params = {
  params: Promise<{ id: string }>;
};

function normalizeCustomerType(value: unknown): SalesCustomerType | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "RESIDENTIAL" || normalized === "COMMERCIAL" || normalized === "CONTRACTOR") {
    return normalized as SalesCustomerType;
  }
  return null;
}

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
          billingAddress: customer.billingAddress,
          city: customer.city,
          state: customer.state,
          zipCode: customer.zipCode,
          companyName: customer.companyName,
          customerType: customer.customerType,
          taxExempt: customer.taxExempt,
          taxRate: customer.taxRate != null ? Number(customer.taxRate) : null,
          referredBy: customer.referredBy,
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

    const updated = await prisma.salesCustomer.update({
      where: { id },
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
          id: updated.id,
          name: updated.name,
          phone: updated.phone,
          email: updated.email,
          installAddress: updated.address,
          billingAddress: updated.billingAddress,
          city: updated.city,
          state: updated.state,
          zipCode: updated.zipCode,
          companyName: updated.companyName,
          customerType: updated.customerType,
          taxExempt: updated.taxExempt,
          taxRate: updated.taxRate != null ? Number(updated.taxRate) : null,
          referredBy: updated.referredBy,
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
