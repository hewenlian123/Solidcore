import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  deny,
  getRequestRole,
  getRequestUser,
  hasOneOf,
} from "@/lib/server-role";
import {
  normalizeIdentityText,
  normalizePhoneDigits,
} from "@/lib/customer-identity";
import { getWritableCustomer } from "@/lib/customers/customer-lifecycle";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
  const { id } = await params;
  const data = await prisma.customerContact.findMany({
    where: { customerId: id },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
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
    const contactRole = String(body?.role ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const email = String(body?.email ?? "").trim();
    const isPrimary = Boolean(body?.isPrimary);
    const duplicateReason = String(body?.duplicateReviewReason ?? "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Contact name is required." },
        { status: 400 },
      );
    }
    if (!phone && !email) {
      return NextResponse.json(
        { error: "Add a phone number or email for this contact." },
        { status: 400 },
      );
    }
    const writable = await getWritableCustomer(prisma, id);
    if (!writable.ok) {
      return NextResponse.json(writable, { status: writable.status });
    }

    const existing = await prisma.customerContact.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "asc" },
    });
    const emailKey = normalizeIdentityText(email);
    const phoneKey = normalizePhoneDigits(phone);
    const strongMatches = existing.filter((contact) => {
      const contactEmail = normalizeIdentityText(contact.email);
      const contactPhone = normalizePhoneDigits(contact.phone);
      return (
        (emailKey && emailKey === contactEmail) ||
        (phoneKey.length >= 7 && phoneKey === contactPhone)
      );
    });
    if (strongMatches.length > 0) {
      return NextResponse.json(
        {
          code: "CONTACT_STRONG_MATCH",
          error:
            "A contact with this phone or email already exists for this customer.",
          matches: strongMatches,
        },
        { status: 409 },
      );
    }
    const possibleMatches = existing.filter(
      (contact) =>
        normalizeIdentityText(contact.name) === normalizeIdentityText(name),
    );
    if (possibleMatches.length > 0 && !duplicateReason) {
      return NextResponse.json(
        {
          code: "CONTACT_POSSIBLE_MATCH",
          error:
            "Review the contact with the same name before creating another.",
          matches: possibleMatches,
        },
        { status: 409 },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.customerContact.updateMany({
          where: { customerId: id, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      const contact = await tx.customerContact.create({
        data: {
          customerId: id,
          name,
          role: contactRole || null,
          phone: phone || null,
          email: email || null,
          isPrimary: isPrimary || existing.length === 0,
        },
      });
      await tx.customerNote.create({
        data: {
          customerId: id,
          createdBy: user?.name || role,
          note: [
            `Contact added: ${name}`,
            contactRole,
            duplicateReason ? `Duplicate review: ${duplicateReason}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
        },
      });
      return contact;
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/customers/[id]/contacts error:", error);
    return NextResponse.json(
      { error: "Failed to add contact." },
      { status: 500 },
    );
  }
}
