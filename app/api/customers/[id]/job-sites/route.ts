import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  deny,
  getRequestRole,
  getRequestUser,
  hasOneOf,
} from "@/lib/server-role";
import { getWritableCustomer } from "@/lib/customers/customer-lifecycle";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
  const { id } = await params;
  const data = await prisma.customerJobSite.findMany({
    where: { customerId: id },
    include: {
      contact: {
        select: { id: true, name: true, phone: true, email: true },
      },
    },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ data }, { status: 200 });
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const user = getRequestUser(request);
    const { id } = await params;
    const body = await request.json();
    const name = String(body?.name ?? "").trim();
    const address1 = String(body?.address1 ?? "").trim();
    const address2 = String(body?.address2 ?? "").trim();
    const city = String(body?.city ?? "").trim();
    const state = String(body?.state ?? "").trim();
    const zipCode = String(body?.zipCode ?? "").trim();
    const notes = String(body?.notes ?? "").trim();
    const contactId = String(body?.contactId ?? "").trim();

    if (!name || !address1 || !city || !state || !zipCode) {
      return NextResponse.json(
        { error: "Job Site name, street, city, state, and ZIP are required." },
        { status: 400 },
      );
    }
    const writable = await getWritableCustomer(prisma, id);
    if (!writable.ok) {
      return NextResponse.json(writable, { status: writable.status });
    }
    if (contactId) {
      const contact = await prisma.customerContact.findFirst({
        where: { id: contactId, customerId: id },
        select: { id: true },
      });
      if (!contact) {
        return NextResponse.json(
          { error: "Selected contact does not belong to this customer." },
          { status: 400 },
        );
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const site = await tx.customerJobSite.create({
        data: {
          customerId: id,
          contactId: contactId || null,
          name,
          address1,
          address2: address2 || null,
          city,
          state,
          zipCode,
          notes: notes || null,
        },
        include: {
          contact: {
            select: { id: true, name: true, phone: true, email: true },
          },
        },
      });
      await tx.customerNote.create({
        data: {
          customerId: id,
          createdBy: user?.name || role,
          note: `Job Site added: ${name} · ${address1}, ${city}, ${state} ${zipCode}`,
        },
      });
      return site;
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/customers/[id]/job-sites error:", error);
    return NextResponse.json(
      { error: "Failed to add Job Site." },
      { status: 500 },
    );
  }
}
