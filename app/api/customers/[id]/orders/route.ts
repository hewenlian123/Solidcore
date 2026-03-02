import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import {
  buildCustomerOrderMetrics,
  filterCustomerOrders,
  type CustomerOrderFilter,
} from "@/lib/customers/customer-order-metrics";

type Params = {
  params: Promise<{ id: string }>;
};

const ALLOWED_FILTERS: CustomerOrderFilter[] = [
  "ALL",
  "OPEN",
  "UNPAID",
  "PENDING_DELIVERY",
  "SPECIAL_ORDER",
];

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const filterInput = String(searchParams.get("filter") ?? "ALL").toUpperCase();
    const filter = (ALLOWED_FILTERS.includes(filterInput as CustomerOrderFilter)
      ? filterInput
      : "ALL") as CustomerOrderFilter;

    const exists = await prisma.salesCustomer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const { rows } = await buildCustomerOrderMetrics(id);
    const filtered = filterCustomerOrders(rows, filter);
    return NextResponse.json({ data: filtered }, { status: 200 });
  } catch (error) {
    console.error("GET /api/customers/[id]/orders error:", error);
    return NextResponse.json({ error: "Failed to fetch customer orders." }, { status: 500 });
  }
}
