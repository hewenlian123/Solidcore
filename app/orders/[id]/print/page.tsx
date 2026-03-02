import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { COMPANY_SETTINGS } from "@/lib/company-settings";
import { formatLineItemTitle, formatOptionalLineNote } from "@/lib/display";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function OrderPrintPage({ params }: Props) {
  const { id } = await params;
  const order = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          product: { select: { name: true } },
        },
      },
    },
  });
  if (!order) return notFound();
  const hidePrices = order.hidePrices;

  return (
    <main className="mx-auto max-w-4xl p-8 text-slate-900">
      <div className="mb-4 print:hidden">
        <Link
          href={`/orders/${id}`}
          className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
        >
          ← Back to Order
        </Link>
      </div>
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold">{COMPANY_SETTINGS.name}</h1>
        <p className="text-sm text-slate-600">{COMPANY_SETTINGS.address}</p>
        <p className="text-sm text-slate-600">{COMPANY_SETTINGS.phone}</p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
        <p>
          <span className="text-slate-500">Document:</span>{" "}
          {order.docType === "QUOTE" ? "Quote" : "Sales Order"}
        </p>
        <p>
          <span className="text-slate-500">Order #:</span> {order.orderNumber}
        </p>
        <p>
          <span className="text-slate-500">Customer:</span> {order.customer.name}
        </p>
        <p>
          <span className="text-slate-500">Date:</span>{" "}
          {new Date(order.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}
        </p>
        <p>
          <span className="text-slate-500">Project:</span> {order.projectName || "-"}
        </p>
        <p>
          <span className="text-slate-500">Status:</span> {order.status}
        </p>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-300">
            <th className="py-2 text-left">Description</th>
            <th className="py-2 text-left">Qty</th>
            {!hidePrices ? <th className="py-2 text-left">Unit Price</th> : null}
            {!hidePrices ? <th className="py-2 text-left">Line Total</th> : null}
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b border-slate-200">
              <td className="py-2">
                <p className="font-medium">
                  {formatLineItemTitle({
                    productName: item.product?.name ?? null,
                    variant: {
                      title: item.titleSnapshot ?? item.productTitle,
                      sku: item.skuSnapshot ?? item.productSku,
                      detailText: item.lineDescription,
                    },
                  })}
                </p>
                <p className="text-xs text-slate-500">SKU: {item.skuSnapshot ?? item.productSku ?? "-"}</p>
                {formatOptionalLineNote(item.lineDescription) ? (
                  <p className="mt-1 whitespace-pre-line text-xs text-slate-600">
                    {formatOptionalLineNote(item.lineDescription)}
                  </p>
                ) : null}
              </td>
              <td className="py-2">{Number(item.quantity)}</td>
              {!hidePrices ? <td className="py-2">${Number(item.unitPrice).toFixed(2)}</td> : null}
              {!hidePrices ? <td className="py-2">${Number(item.lineTotal).toFixed(2)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>

      {!hidePrices ? (
        <div className="mt-6 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Subtotal</span>
            <span>${Number(order.subtotal).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Discount</span>
            <span>${Number(order.discount).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Tax</span>
            <span>${Number(order.tax).toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold">
            <span>Total</span>
            <span>${Number(order.total).toFixed(2)}</span>
          </div>
        </div>
      ) : null}
    </main>
  );
}
