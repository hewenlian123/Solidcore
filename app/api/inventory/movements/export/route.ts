import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import {
  buildInventoryMovementWhere,
  parseInventoryMovementFilters,
  parseReturnIdFromMovementNote,
} from "@/lib/inventory-movements";

function toCsvCell(value: unknown) {
  const text = String(value ?? "");
  const escaped = text.replaceAll('"', '""');
  return `"${escaped}"`;
}

export async function GET(request: NextRequest) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "WAREHOUSE", "SALES"])) return deny();

  try {
    const { searchParams } = new URL(request.url);
    const filters = parseInventoryMovementFilters(searchParams);
    const where = buildInventoryMovementWhere(filters);

    const rows = await prisma.inventoryMovement.findMany({
      where,
      include: {
        variant: {
          select: {
            sku: true,
            displayName: true,
            product: { select: { name: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 5000,
    });

    const headers = [
      "createdAt",
      "sku",
      "displayName",
      "type",
      "qty",
      "unit",
      "note",
      "fulfillmentId",
      "returnId",
    ];

    const lines = [headers.join(",")];
    for (const row of rows) {
      const returnId = parseReturnIdFromMovementNote(row.note);
      lines.push(
        [
          row.createdAt.toISOString(),
          row.variant?.sku ?? "",
          row.variant?.displayName ?? row.variant?.product?.name ?? "",
          row.type,
          Number(row.qty),
          row.unit ?? "",
          row.note ?? "",
          row.fulfillmentId ?? "",
          returnId ?? "",
        ]
          .map(toCsvCell)
          .join(","),
      );
    }

    const timestamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
    const filename = `inventory-movements-${timestamp}.csv`;
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/inventory/movements/export error:", error);
    return new Response("Failed to export inventory movements.", { status: 500 });
  }
}
