import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { normalizeAlias } from "@/lib/customers/customer-lifecycle";
import {
  normalizeIdentityText,
  normalizePhoneDigits,
} from "@/lib/customer-identity";
import { prisma } from "@/lib/prisma";
import {
  deny,
  getRequestRole,
  getRequestUser,
  hasOneOf,
} from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN"])) return deny();
    const user = getRequestUser(request);
    const { id: sourceCustomerId } = await params;
    const body = await request.json();
    const targetCustomerId = String(body?.targetCustomerId ?? "").trim();
    const reason = String(body?.reason ?? "").trim();

    if (!targetCustomerId || targetCustomerId === sourceCustomerId) {
      return NextResponse.json(
        { error: "Choose a different active customer as the merge target." },
        { status: 400 },
      );
    }
    if (reason.length < 8) {
      return NextResponse.json(
        { error: "Provide a clear merge reason of at least 8 characters." },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const lockIds = [sourceCustomerId, targetCustomerId].sort();
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "customers" WHERE id IN (${Prisma.join(
            lockIds,
          )}) ORDER BY id FOR UPDATE`,
        );
        const [source, target] = await Promise.all([
          tx.salesCustomer.findUnique({
            where: { id: sourceCustomerId },
            select: {
              id: true,
              name: true,
              companyName: true,
              phone: true,
              email: true,
              archivedAt: true,
              mergedIntoId: true,
            },
          }),
          tx.salesCustomer.findUnique({
            where: { id: targetCustomerId },
            select: {
              id: true,
              name: true,
              companyName: true,
              archivedAt: true,
              mergedIntoId: true,
            },
          }),
        ]);
        if (!source || !target) {
          return { status: 404 as const, error: "Customer not found." };
        }
        if (source.mergedIntoId) {
          return {
            status: 409 as const,
            error: "This customer was already merged.",
            code: "CUSTOMER_MERGED",
            redirectCustomerId: source.mergedIntoId,
          };
        }
        if (source.archivedAt) {
          return {
            status: 409 as const,
            error: "Restore the source customer before merging.",
          };
        }
        if (target.archivedAt || target.mergedIntoId) {
          return {
            status: 409 as const,
            error: "The merge target must be an active primary customer.",
          };
        }

        const aliases = [
          ["NAME", source.name],
          ["COMPANY", source.companyName],
          ["EMAIL", source.email],
          ["PHONE", source.phone],
        ]
          .filter((entry): entry is [string, string] =>
            Boolean(entry[1]?.trim()),
          )
          .map(([kind, value]) => ({
            customerId: targetCustomerId,
            sourceCustomerId,
            kind,
            value: value.trim(),
            normalizedValue:
              kind === "PHONE"
                ? normalizePhoneDigits(value)
                : kind === "EMAIL"
                  ? normalizeIdentityText(value)
                  : normalizeAlias(value),
          }));

        if (aliases.length > 0) {
          await tx.customerAlias.createMany({
            data: aliases,
            skipDuplicates: true,
          });
        }

        await tx.customerContact.updateMany({
          where: { customerId: sourceCustomerId },
          data: { customerId: targetCustomerId },
        });
        await tx.customerJobSite.updateMany({
          where: { customerId: sourceCustomerId },
          data: { customerId: targetCustomerId },
        });
        await tx.customerFollowUp.updateMany({
          where: { customerId: sourceCustomerId },
          data: { customerId: targetCustomerId },
        });
        await tx.customerNote.updateMany({
          where: { customerId: sourceCustomerId },
          data: { customerId: targetCustomerId },
        });

        const actor = user?.name || role;
        const mergedAt = new Date();
        await tx.salesCustomer.update({
          where: { id: sourceCustomerId },
          data: {
            archivedAt: mergedAt,
            mergedIntoId: targetCustomerId,
            mergedAt,
            mergedBy: actor,
            mergeReason: reason,
          },
        });
        await tx.customerLifecycleEvent.create({
          data: {
            customerId: targetCustomerId,
            sourceCustomerId,
            action: "MERGED",
            reason,
            actor,
          },
        });

        return {
          status: 200 as const,
          data: {
            sourceCustomerId,
            targetCustomerId,
            targetName: target.companyName || target.name,
            mergedAt,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    if ("error" in result) {
      return NextResponse.json(result, { status: result.status });
    }
    return NextResponse.json({ data: result.data }, { status: 200 });
  } catch (error) {
    console.error("POST /api/customers/[id]/merge error:", error);
    return NextResponse.json(
      { error: "Failed to merge customers." },
      { status: 500 },
    );
  }
}
