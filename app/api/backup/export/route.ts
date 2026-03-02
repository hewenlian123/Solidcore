import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN"])) return deny();

    const format = request.nextUrl.searchParams.get("format") ?? "json";

    const [products, orders, customers, suppliers, tickets] = await Promise.all([
      prisma.product.findMany(),
      prisma.order.findMany(),
      prisma.customer.findMany(),
      prisma.supplier.findMany(),
      prisma.afterSalesTicket.findMany(),
    ]);

    const payload = { products, orders, customers, suppliers, tickets };

    if (format === "xlsx") {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(products as any[]), "products");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orders as any[]), "orders");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(customers as any[]), "customers");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(suppliers as any[]), "suppliers");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tickets as any[]), "after_sales");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="solidcore-backup-${Date.now()}.xlsx"`,
        },
      });
    }

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="solidcore-backup-${Date.now()}.json"`,
      },
    });
  } catch (error) {
    console.error("GET /api/backup/export error:", error);
    return NextResponse.json({ error: "Failed to export backup." }, { status: 500 });
  }
}
