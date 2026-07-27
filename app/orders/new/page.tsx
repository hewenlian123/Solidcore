import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{ docType?: string | string[] }>;
};

export default async function NewOrderEntryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const requested = Array.isArray(params.docType)
    ? params.docType[0]
    : params.docType;
  const docType =
    String(requested ?? "").toUpperCase() === "QUOTE" ? "QUOTE" : "SALES_ORDER";
  redirect(`/sales-orders/new?docType=${docType}`);
}
