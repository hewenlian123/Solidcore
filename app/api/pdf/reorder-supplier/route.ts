import { NextRequest, NextResponse } from "next/server";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { generateReorderSupplierPDF } from "@/lib/pdf/generateReorderSupplierPDF";

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const payload = await request.json();
    const supplierName = String(payload?.supplierName ?? "").trim();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!supplierName) {
      return NextResponse.json({ error: "Supplier name is required." }, { status: 400 });
    }
    if (items.length === 0) {
      return NextResponse.json({ error: "At least one item is required for PDF export." }, { status: 400 });
    }

    const poNumberRaw = String(payload?.poNumber ?? "").trim();
    const title =
      poNumberRaw.length > 0
        ? ("Purchase Order (Draft)" as const)
        : ("Reorder Request" as const);

    const pdfBytes = await generateReorderSupplierPDF({
      title,
      poNumber: poNumberRaw || null,
      date: payload?.date ?? new Date().toISOString(),
      supplierName,
      supplierContactName: payload?.supplierContactName ? String(payload.supplierContactName) : null,
      supplierPhone: payload?.supplierPhone ? String(payload.supplierPhone) : null,
      items: items.map((item: any) => ({
        sku: String(item?.sku ?? ""),
        itemName: String(item?.itemName ?? ""),
        qtyBoxes: Math.max(Number(item?.qtyBoxes ?? 0), 0),
        qtySqft:
          item?.qtySqft === null || item?.qtySqft === undefined
            ? null
            : Math.max(Number(item?.qtySqft ?? 0), 0),
        unitCost:
          item?.unitCost === null || item?.unitCost === undefined
            ? null
            : Math.max(Number(item?.unitCost ?? 0), 0),
        notes: item?.notes ? String(item.notes) : null,
      })),
    });

    const { searchParams } = new URL(request.url);
    const asDownload = searchParams.get("download") !== "false";
    const disposition = asDownload ? "attachment" : "inline";
    const safeSupplier = supplierName.replace(/[^\w\-]+/g, "-").slice(0, 40) || "supplier";

    return new Response(new Uint8Array(pdfBytes).buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename=reorder-${safeSupplier}.pdf`,
      },
    });
  } catch (error) {
    console.error("POST /api/pdf/reorder-supplier error:", error);
    return NextResponse.json({ error: "Failed to export supplier PDF." }, { status: 500 });
  }
}

