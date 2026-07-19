export type WarehouseFulfillmentType = "PICKUP" | "DELIVERY";

export type WarehouseFulfillmentStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PACKING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "PICKED_UP"
  | "OUT"
  | "PARTIAL"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type WarehouseStageId = "toPick" | "picking" | "ready";

export type WarehouseMethodFilter = "all" | "pickup" | "delivery";

export type WarehouseQueueRowBase = {
  type: WarehouseFulfillmentType;
  status: string | null | undefined;
};

export const WAREHOUSE_STAGE_DEFINITIONS: Array<{
  id: WarehouseStageId;
  label: string;
  description: string;
}> = [
  {
    id: "toPick",
    label: "To Pick",
    description: "Draft or scheduled fulfillments waiting for picking.",
  },
  {
    id: "picking",
    label: "Picking",
    description: "Material being picked, packed, or partially fulfilled.",
  },
  {
    id: "ready",
    label: "Ready",
    description: "Fulfillments staged and ready for pickup or delivery handoff.",
  },
];

export const WAREHOUSE_METHOD_FILTERS: Array<{
  id: WarehouseMethodFilter;
  label: string;
  description: string;
}> = [
  {
    id: "all",
    label: "All",
    description: "Pickup and delivery tasks in the selected stage.",
  },
  {
    id: "pickup",
    label: "Pickup",
    description: "Only pickup tasks in the selected stage.",
  },
  {
    id: "delivery",
    label: "Delivery",
    description: "Only delivery tasks in the selected stage.",
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
    normalized === "PACKING" ||
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

export function getWarehouseStatusStage(
  status: string | null | undefined,
): WarehouseStageId | null {
  const normalized = normalizeWarehouseStatus(status);
  if (normalized === "DRAFT" || normalized === "SCHEDULED") return "toPick";
  if (normalized === "PACKING" || normalized === "PARTIAL") return "picking";
  if (normalized === "READY") return "ready";
  return null;
}

export function isRowInWarehouseStage<T extends WarehouseQueueRowBase>(
  row: T,
  stageId: WarehouseStageId,
) {
  if (isClosedWarehouseStatus(row.status)) return false;
  return getWarehouseStatusStage(row.status) === stageId;
}

export function rowMatchesWarehouseMethod<T extends WarehouseQueueRowBase>(
  row: T,
  method: WarehouseMethodFilter,
) {
  if (method === "all") return true;
  if (method === "pickup") return row.type === "PICKUP";
  return row.type === "DELIVERY";
}

export function countWarehouseStages<T extends WarehouseQueueRowBase & { id?: string }>(rows: T[]) {
  return Object.fromEntries(
    WAREHOUSE_STAGE_DEFINITIONS.map((stage) => [
      stage.id,
      new Set(rows.filter((row) => isRowInWarehouseStage(row, stage.id)).map((row, index) => row.id ?? index)).size,
    ]),
  ) as Record<WarehouseStageId, number>;
}

export function countWarehouseMethodSnapshot<T extends WarehouseQueueRowBase>(rows: T[]) {
  return {
    pickupReady: rows.filter((row) => row.type === "PICKUP" && normalizeWarehouseStatus(row.status) === "READY").length,
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
  stageId: WarehouseStageId;
}) {
  const status = normalizeWarehouseStatus(args.status);

  if (args.stageId === "toPick") {
    return { label: "Open Picking", href: "/warehouse/picking" };
  }
  if (args.stageId === "picking") {
    return status === "PACKING" || status === "PARTIAL"
      ? { label: "Continue Packing", href: "/warehouse/packing" }
      : { label: "Continue Picking", href: "/warehouse/picking" };
  }
  return { label: "Open Fulfillment", href: `/fulfillment/${args.id}` };
}
