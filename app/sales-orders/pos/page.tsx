import { redirect } from "next/navigation";

export default function POSOrderPage() {
  redirect("/sales-orders/new?docType=SALES_ORDER");
}
