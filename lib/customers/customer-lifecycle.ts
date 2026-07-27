import type { Prisma, PrismaClient } from "@prisma/client";

type CustomerClient = PrismaClient | Prisma.TransactionClient;

export type WritableCustomerResult =
  | { ok: true }
  | {
      ok: false;
      status: 404 | 409;
      code: "CUSTOMER_NOT_FOUND" | "CUSTOMER_ARCHIVED" | "CUSTOMER_MERGED";
      error: string;
      redirectCustomerId?: string;
    };

export async function getWritableCustomer(
  client: CustomerClient,
  customerId: string,
): Promise<WritableCustomerResult> {
  const customer = await client.salesCustomer.findUnique({
    where: { id: customerId },
    select: { id: true, archivedAt: true, mergedIntoId: true },
  });
  if (!customer) {
    return {
      ok: false,
      status: 404,
      code: "CUSTOMER_NOT_FOUND",
      error: "Customer not found.",
    };
  }
  if (customer.mergedIntoId) {
    return {
      ok: false,
      status: 409,
      code: "CUSTOMER_MERGED",
      error: "This customer was merged into another customer.",
      redirectCustomerId: customer.mergedIntoId,
    };
  }
  if (customer.archivedAt) {
    return {
      ok: false,
      status: 409,
      code: "CUSTOMER_ARCHIVED",
      error: "Restore this customer before making changes.",
    };
  }
  return { ok: true };
}

export function normalizeAlias(value: string) {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}
