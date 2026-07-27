import { NextRequest, NextResponse } from "next/server";
import { SalesCustomerType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { getDefaultTaxRate } from "@/lib/settings";
import {
  classifyCustomerIdentityMatch,
  normalizeIdentityText,
  normalizePhoneDigits,
} from "@/lib/customer-identity";

function normalizeCustomerType(value: unknown): SalesCustomerType | null {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (!normalized) return null;
  if (
    normalized === "RESIDENTIAL" ||
    normalized === "COMMERCIAL" ||
    normalized === "CONTRACTOR"
  ) {
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
    const status = String(searchParams.get("status") ?? "ACTIVE")
      .trim()
      .toUpperCase();
    const showArchived = status === "ARCHIVED";

    const customers = await prisma.salesCustomer.findMany({
      where: {
        archivedAt: showArchived ? { not: null } : null,
        mergedIntoId: null,
        ...(q
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
                {
                  contacts: {
                    some: {
                      OR: [
                        { name: { contains: q } },
                        { phone: { contains: q } },
                        { email: { contains: q } },
                      ],
                    },
                  },
                },
                {
                  jobSites: {
                    some: {
                      OR: [
                        { name: { contains: q } },
                        { address1: { contains: q } },
                        { city: { contains: q } },
                        { zipCode: { contains: q } },
                      ],
                    },
                  },
                },
                { aliases: { some: { value: { contains: q } } } },
              ],
            }
          : {}),
      },
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
        archivedAt: true,
        createdAt: true,
        contacts: {
          orderBy: [
            { isPrimary: "desc" as const },
            { createdAt: "asc" as const },
          ],
          take: 1,
          select: {
            id: true,
            name: true,
            role: true,
            phone: true,
            email: true,
          },
        },
        jobSites: {
          where: { active: true },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: {
            id: true,
            name: true,
            address1: true,
            city: true,
            state: true,
            zipCode: true,
          },
        },
        followUps: {
          where: { status: "OPEN" },
          orderBy: { dueAt: "asc" },
          take: 1,
          select: { id: true, owner: true, dueAt: true, nextAction: true },
        },
        _count: {
          select: { contacts: true, jobSites: true },
        },
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
          archivedAt: item.archivedAt,
          createdAt: item.createdAt,
          primaryContact: item.contacts[0] ?? null,
          primaryJobSite: item.jobSites[0] ?? null,
          nextFollowUp: item.followUps[0] ?? null,
          contactCount: item._count.contacts,
          jobSiteCount: item._count.jobSites,
        })),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/customers error:", error);
    return NextResponse.json(
      { error: "Failed to fetch customer data." },
      { status: 500 },
    );
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
    const contactName = String(body?.contactName ?? "").trim();
    const contactRole = String(body?.contactRole ?? "").trim();
    const jobSiteName = String(body?.jobSiteName ?? "").trim();
    const customerType = normalizeCustomerType(body?.customerType);
    const taxExempt = Boolean(body?.taxExempt ?? false);
    const parsedTaxRate =
      body?.taxRate === null ||
      body?.taxRate === undefined ||
      body?.taxRate === ""
        ? null
        : Number(body?.taxRate);
    const referredBy = String(body?.referredBy ?? "").trim();
    const notes = String(body?.notes ?? "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Customer name is required." },
        { status: 400 },
      );
    }
    if (
      body?.customerType !== undefined &&
      body?.customerType !== null &&
      !customerType
    ) {
      return NextResponse.json(
        { error: "Invalid customer type." },
        { status: 400 },
      );
    }
    if (
      parsedTaxRate !== null &&
      (!Number.isFinite(parsedTaxRate) || parsedTaxRate < 0)
    ) {
      return NextResponse.json(
        { error: "Tax rate must be a non-negative number." },
        { status: 400 },
      );
    }

    const duplicateReviewReason = String(
      body?.duplicateReviewReason ?? "",
    ).trim();
    const phoneDigits = phone.replace(/\D/g, "");
    const phoneSuffix = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : "";
    const inputEmail = normalizeIdentityText(email);
    const inputPhone = normalizePhoneDigits(phone);
    const identityCandidates = await prisma.salesCustomer.findMany({
      where: {
        mergedIntoId: null,
        OR: [
          { name: { equals: name, mode: "insensitive" } },
          ...(companyName
            ? [
                {
                  companyName: {
                    equals: companyName,
                    mode: "insensitive" as const,
                  },
                },
              ]
            : []),
          ...(email
            ? [{ email: { equals: email, mode: "insensitive" as const } }]
            : []),
          ...(phoneSuffix ? [{ phone: { contains: phoneSuffix } }] : []),
          ...(email
            ? [
                {
                  contacts: {
                    some: {
                      email: { equals: email, mode: "insensitive" as const },
                    },
                  },
                },
              ]
            : []),
          ...(phoneSuffix
            ? [{ contacts: { some: { phone: { contains: phoneSuffix } } } }]
            : []),
          ...(inputEmail
            ? [
                {
                  aliases: {
                    some: { kind: "EMAIL", normalizedValue: inputEmail },
                  },
                },
              ]
            : []),
          ...(inputPhone.length >= 7
            ? [
                {
                  aliases: {
                    some: { kind: "PHONE", normalizedValue: inputPhone },
                  },
                },
              ]
            : []),
        ],
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
        notes: true,
        contacts: {
          select: { name: true, phone: true, email: true },
          take: 20,
        },
        aliases: {
          where: { kind: { in: ["EMAIL", "PHONE"] } },
          select: { kind: true, normalizedValue: true },
        },
      },
      take: 20,
    });
    const identityMatches = identityCandidates
      .map((candidate) => {
        const baseStrength = classifyCustomerIdentityMatch(
          { name, phone, email, companyName },
          candidate,
        );
        const contactStrong = candidate.contacts.some((contact) => {
          const candidateEmail = normalizeIdentityText(contact.email);
          const candidatePhone = normalizePhoneDigits(contact.phone);
          return (
            (inputEmail && inputEmail === candidateEmail) ||
            (inputPhone.length >= 7 && inputPhone === candidatePhone)
          );
        });
        const aliasStrong = candidate.aliases.some(
          (alias) =>
            (alias.kind === "EMAIL" &&
              Boolean(inputEmail) &&
              alias.normalizedValue === inputEmail) ||
            (alias.kind === "PHONE" &&
              inputPhone.length >= 7 &&
              alias.normalizedValue === inputPhone),
        );
        return {
          id: candidate.id,
          name: candidate.name,
          phone: candidate.phone,
          email: candidate.email,
          installAddress: candidate.address,
          billingAddress: candidate.billingAddress,
          city: candidate.city,
          state: candidate.state,
          zipCode: candidate.zipCode,
          companyName: candidate.companyName,
          customerType: candidate.customerType,
          taxExempt: candidate.taxExempt,
          taxRate: candidate.taxRate != null ? Number(candidate.taxRate) : null,
          notes: candidate.notes,
          strength:
            contactStrong || aliasStrong ? ("STRONG" as const) : baseStrength,
        };
      })
      .filter((candidate) => candidate.strength !== null);
    const strongMatches = identityMatches.filter(
      (candidate) => candidate.strength === "STRONG",
    );
    if (strongMatches.length > 0) {
      return NextResponse.json(
        {
          code: "CUSTOMER_STRONG_MATCH",
          error:
            "An existing customer has the same phone or email. Review and use that customer.",
          matches: strongMatches,
        },
        { status: 409 },
      );
    }
    if (identityMatches.length > 0 && !duplicateReviewReason) {
      return NextResponse.json(
        {
          code: "CUSTOMER_POSSIBLE_MATCH",
          error:
            "A possible customer match needs review before creating a new record.",
          matches: identityMatches,
        },
        { status: 409 },
      );
    }

    const defaultTaxRate = await getDefaultTaxRate(prisma);
    const resolvedTaxRate = taxExempt
      ? null
      : (parsedTaxRate ?? defaultTaxRate);

    const created = await prisma.$transaction(async (tx) => {
      const customer = await tx.salesCustomer.create({
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
          notes:
            [
              notes,
              duplicateReviewReason
                ? `Duplicate review: ${duplicateReviewReason}`
                : "",
            ]
              .filter(Boolean)
              .join("\n") || null,
        },
      });
      const contact = await tx.customerContact.create({
        data: {
          customerId: customer.id,
          name: contactName || name,
          role: contactRole || "Primary contact",
          phone: phone || null,
          email: email || null,
          isPrimary: true,
        },
      });
      if (jobSiteName && installAddress && city && state && zipCode) {
        await tx.customerJobSite.create({
          data: {
            customerId: customer.id,
            contactId: contact.id,
            name: jobSiteName,
            address1: installAddress,
            city,
            state,
            zipCode,
          },
        });
      }
      return customer;
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
    return NextResponse.json(
      { error: "Failed to create customer." },
      { status: 500 },
    );
  }
}
