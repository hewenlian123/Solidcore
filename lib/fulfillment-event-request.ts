import { createHash } from "node:crypto";
import type { SalesFulfillmentType } from "@prisma/client";

function normalizeItems(items: unknown) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: String((item as { id?: unknown } | null)?.id ?? "").trim(),
      fulfilledQty: String(
        (item as { fulfilledQty?: unknown } | null)?.fulfilledQty ?? "",
      ).trim(),
      notes: String(
        (item as { notes?: unknown } | null)?.notes ?? "",
      ).trim(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function createFulfillmentEventRequest(args: {
  fulfillmentId: string;
  method: SalesFulfillmentType;
  items: unknown;
  providedKey?: string | null;
}) {
  const requestFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        fulfillmentId: args.fulfillmentId,
        method: args.method,
        items: normalizeItems(args.items),
      }),
    )
    .digest("hex");
  const idempotencyKey =
    String(args.providedKey ?? "").trim() ||
    `fulfillment:${args.fulfillmentId}:${requestFingerprint}`;
  return { idempotencyKey, requestFingerprint };
}
