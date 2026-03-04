import { Prisma } from "@prisma/client";

export type InventoryMovementFilters = {
  q: string;
  type: string;
  variantId: string;
  from: Date | null;
  to: Date | null;
};

export function parseDateStart(raw: string | null) {
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseDateEnd(raw: string | null) {
  if (!raw) return null;
  const date = new Date(`${raw}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseReturnIdFromMovementNote(note: string | null | undefined): string | null {
  const text = String(note ?? "").trim();
  if (!text) return null;
  const match = text.match(/^Return\s+([A-Za-z0-9-]+)\s*:/i);
  return match?.[1] ? String(match[1]) : null;
}

export function parseInventoryMovementFilters(searchParams: URLSearchParams): InventoryMovementFilters {
  return {
    q: String(searchParams.get("q") ?? "").trim(),
    type: String(searchParams.get("type") ?? "").trim(),
    variantId: String(searchParams.get("variantId") ?? "").trim(),
    from: parseDateStart(searchParams.get("from")),
    to: parseDateEnd(searchParams.get("to")),
  };
}

export function buildInventoryMovementWhere(filters: InventoryMovementFilters): Prisma.InventoryMovementWhereInput {
  const where: Prisma.InventoryMovementWhereInput = {
    ...(filters.variantId ? { variantId: filters.variantId } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...((filters.from || filters.to)
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    ...(filters.q
      ? {
          OR: [
            { variant: { is: { sku: { contains: filters.q } } } },
            { variant: { is: { displayName: { contains: filters.q } } } },
            { variant: { is: { product: { is: { name: { contains: filters.q } } } } } },
          ],
        }
      : {}),
  };
  return where;
}

export function toMovementLimit(raw: string | null, fallback: number, max: number) {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}
