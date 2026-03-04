import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseDateStart(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateEnd(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
  try {
    const from = parseDateStart(request.nextUrl.searchParams.get("from"));
    const to = parseDateEnd(request.nextUrl.searchParams.get("to"));
    const invoiceWhere: any = {
      status: { not: "void" },
      ...((from || to)
        ? {
            issueDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };
    const paymentWhere: any = {
      status: "POSTED",
      ...((from || to)
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [invoices, payments] = await Promise.all([
      prisma.invoice.findMany({
        where: invoiceWhere,
        select: {
          id: true,
          invoiceNumber: true,
          issueDate: true,
          total: true,
          customer: { select: { name: true } },
        },
      }),
      prisma.salesOrderPayment.findMany({
        where: paymentWhere,
        select: {
          id: true,
          invoiceId: true,
          amount: true,
          createdAt: true,
          method: true,
          salesOrder: { select: { orderNumber: true, customer: { select: { name: true } } } },
        },
      }),
    ]);

    const paidByInvoice = new Map<string, number>();
    for (const payment of payments) {
      if (!payment.invoiceId) continue;
      const prev = paidByInvoice.get(payment.invoiceId) ?? 0;
      paidByInvoice.set(payment.invoiceId, round2(prev + Number(payment.amount)));
    }

    const header = [
      "recordType",
      "invoiceId",
      "invoiceNumber",
      "issueDate",
      "customer",
      "totalInvoiced",
      "totalPaid",
      "outstanding",
      "paymentId",
      "paymentDate",
      "paymentMethod",
      "paymentAmount",
      "matched",
    ];
    const lines = [header.join(",")];

    for (const invoice of invoices) {
      const paid = round2(paidByInvoice.get(invoice.id) ?? 0);
      const total = round2(Number(invoice.total));
      const outstanding = round2(Math.max(total - paid, 0));
      lines.push(
        [
          "INVOICE",
          invoice.id,
          invoice.invoiceNumber,
          invoice.issueDate.toISOString(),
          invoice.customer?.name ?? "",
          total,
          paid,
          outstanding,
          "",
          "",
          "",
          "",
          outstanding <= 0 ? "YES" : "NO",
        ]
          .map(csvCell)
          .join(","),
      );
    }

    for (const payment of payments.filter((p) => !p.invoiceId)) {
      lines.push(
        [
          "PAYMENT_UNMATCHED",
          "",
          "",
          "",
          payment.salesOrder?.customer?.name ?? "",
          "",
          "",
          "",
          payment.id,
          payment.createdAt.toISOString(),
          payment.method,
          round2(Number(payment.amount)),
          "NO",
        ]
          .map(csvCell)
          .join(","),
      );
    }

    const ts = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"reconciliation-${ts}.csv\"`,
      },
    });
  } catch (error) {
    console.error("GET /api/reconciliation/export error:", error);
    return new Response("Failed to export reconciliation report.", { status: 500 });
  }
}

