export type WarehouseFulfillmentType = "PICKUP" | "DELIVERY";

export type WarehouseFulfillmentStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "PICKED_UP"
  | "OUT"
  | "PARTIAL"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type WarehouseSectionId = "needsReady" | "ready" | "inDelivery";

export type WarehouseMethodFilter = "pickup" | "delivery";

export type WarehouseQueueRowBase = {
  type: WarehouseFulfillmentType;
  status: string | null | undefined;
};

export const WAREHOUSE_METHOD_FILTERS: Array<{
  id: WarehouseMethodFilter;
  label: string;
  description: string;
}> = [
  {
    id: "pickup",
    label: "Pickup",
    description: "Counter pickup tasks waiting to be readied or handed off.",
  },
  {
    id: "delivery",
    label: "Delivery",
    description: "Delivery tasks waiting to be readied or sent out.",
  },
];

export const WAREHOUSE_SECTION_DEFINITIONS: Array<{
  id: WarehouseSectionId;
  label: string;
  pickupLabel: string;
  deliveryLabel: string;
  description: string;
}> = [
  {
    id: "needsReady",
    label: "Needs Ready",
    pickupLabel: "Needs Ready",
    deliveryLabel: "Needs Ready",
    description: "Confirmed work that still needs an explicit Ready check.",
  },
  {
    id: "ready",
    label: "Ready",
    pickupLabel: "Ready for Pickup",
    deliveryLabel: "Ready for Delivery",
    description: "Material staged for customer pickup or delivery handoff.",
  },
  {
    id: "inDelivery",
    label: "In Delivery",
    pickupLabel: "In Delivery",
    deliveryLabel: "In Delivery",
    description: "Delivery work already out or actively in progress.",
  },
];

export const CLOSED_WAREHOUSE_STATUSES = new Set([
  "COMPLETED",
  "CANCELLED",
  "DELIVERED",
  "PICKED_UP",
]);

export function normalizeWarehouseStatus(
  status: string | null | undefined,
): WarehouseFulfillmentStatus | "UNKNOWN" {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (
    normalized === "DRAFT" ||
    normalized === "SCHEDULED" ||
    normalized === "READY" ||
    normalized === "OUT_FOR_DELIVERY" ||
    normalized === "DELIVERED" ||
    normalized === "PICKED_UP" ||
    normalized === "OUT" ||
    normalized === "PARTIAL" ||
    normalized === "IN_PROGRESS" ||
    normalized === "COMPLETED" ||
    normalized === "CANCELLED"
  ) {
    return normalized;
  }
  return "UNKNOWN";
}

export function isClosedWarehouseStatus(status: string | null | undefined) {
  return CLOSED_WAREHOUSE_STATUSES.has(normalizeWarehouseStatus(status));
}

export function isDeliveryHandoffStatus(status: string | null | undefined) {
  const normalized = normalizeWarehouseStatus(status);
  return normalized === "OUT_FOR_DELIVERY" || normalized === "OUT" || normalized === "IN_PROGRESS";
}

export function getWarehouseStatusSection(
  status: string | null | undefined,
  type: WarehouseFulfillmentType = "PICKUP",
): WarehouseSectionId | null {
  const normalized = normalizeWarehouseStatus(status);
  if (normalized === "DRAFT" || normalized === "SCHEDULED" || normalized === "PARTIAL") {
    return "needsReady";
  }
  if (normalized === "READY") return "ready";
  if (type === "DELIVERY" && isDeliveryHandoffStatus(normalized)) return "inDelivery";
  return null;
}

export function isRowInWarehouseSection<T extends WarehouseQueueRowBase>(
  row: T,
  sectionId: WarehouseSectionId,
) {
  if (isClosedWarehouseStatus(row.status)) return false;
  return getWarehouseStatusSection(row.status, row.type) === sectionId;
}

export function rowMatchesWarehouseMethod<T extends WarehouseQueueRowBase>(
  row: T,
  method: WarehouseMethodFilter,
) {
  if (method === "pickup") return row.type === "PICKUP";
  return row.type === "DELIVERY";
}

export function countWarehouseSections<T extends WarehouseQueueRowBase & { id?: string }>(
  rows: T[],
  method: WarehouseMethodFilter,
) {
  return Object.fromEntries(
    WAREHOUSE_SECTION_DEFINITIONS.map((section) => [
      section.id,
      new Set(
        rows
          .filter((row) => rowMatchesWarehouseMethod(row, method))
          .filter((row) => isRowInWarehouseSection(row, section.id))
          .map((row, index) => row.id ?? index),
      ).size,
    ]),
  ) as Record<WarehouseSectionId, number>;
}

export function countWarehouseMethodSnapshot<T extends WarehouseQueueRowBase>(rows: T[]) {
  return {
    pickupNeedsReady: rows.filter(
      (row) => row.type === "PICKUP" && getWarehouseStatusSection(row.status, row.type) === "needsReady",
    ).length,
    pickupReady: rows.filter((row) => row.type === "PICKUP" && normalizeWarehouseStatus(row.status) === "READY")
      .length,
    deliveryNeedsReady: rows.filter(
      (row) => row.type === "DELIVERY" && getWarehouseStatusSection(row.status, row.type) === "needsReady",
    ).length,
    deliveryReady: rows.filter((row) => row.type === "DELIVERY" && normalizeWarehouseStatus(row.status) === "READY")
      .length,
    deliveryActive: rows.filter((row) => row.type === "DELIVERY" && isDeliveryHandoffStatus(row.status)).length,
  };
}

export function formatWarehouseStatus(status: string | null | undefined) {
  const normalized = normalizeWarehouseStatus(status);
  if (normalized === "UNKNOWN") return "Unknown";
  if (normalized === "OUT_FOR_DELIVERY") return "Out for Delivery";
  if (normalized === "PICKED_UP") return "Picked Up";
  return normalized
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getWarehousePrimaryAction(args: {
  id: string;
  type: WarehouseFulfillmentType;
  status: string | null | undefined;
}) {
  const sectionId = getWarehouseStatusSection(args.status, args.type);
  if (sectionId === "needsReady") {
    return { kind: "markReady" as const, label: "Mark Ready" };
  }
  if (sectionId === "ready") {
    return {
      kind: "link" as const,
      label: args.type === "DELIVERY" ? "Open Delivery" : "Open Pickup",
      href: `/fulfillment/${args.id}`,
    };
  }
  if (sectionId === "inDelivery") {
    return { kind: "link" as const, label: "Open Delivery", href: `/fulfillment/${args.id}` };
  }
  return { kind: "link" as const, label: "Open Fulfillment", href: `/fulfillment/${args.id}` };
}
