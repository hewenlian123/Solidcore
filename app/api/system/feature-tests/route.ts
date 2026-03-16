import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

const TEST_PREFIX = "[TEST-FEATURE] ";

type TestResult = { name: string; status: "passed" | "failed"; message?: string };

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN"])) return deny();

  const results: TestResult[] = [];
  let createdCustomerId: string | null = null;
  let createdProductId: string | null = null;
  let createdOrderId: string | null = null;

  async function cleanup() {
    try {
      if (createdOrderId) await prisma.salesOrder.delete({ where: { id: createdOrderId } }).catch(() => {});
      if (createdProductId) await prisma.salesProduct.delete({ where: { id: createdProductId } }).catch(() => {});
      if (createdCustomerId) await prisma.salesCustomer.delete({ where: { id: createdCustomerId } }).catch(() => {});
    } catch {
      // ignore
    }
  }

  // 1. Create product (SalesProduct)
  try {
    const product = await prisma.salesProduct.create({
      data: {
        name: `${TEST_PREFIX}Product ${Date.now()}`,
        unit: "SQM",
        price: 1,
        cost: 0.5,
      },
    });
    createdProductId = product.id;
    results.push({ name: "createProduct", status: "passed" });
  } catch (e) {
    results.push({ name: "createProduct", status: "failed", message: e instanceof Error ? e.message : "Create failed" });
  }

  // 2. Create customer (SalesCustomer)
  try {
    const customer = await prisma.salesCustomer.create({
      data: {
        name: `${TEST_PREFIX}Customer ${Date.now()}`,
        phone: "555-0000",
      },
    });
    createdCustomerId = customer.id;
    results.push({ name: "createCustomer", status: "passed" });
  } catch (e) {
    results.push({ name: "createCustomer", status: "failed", message: e instanceof Error ? e.message : "Create failed" });
  }

  // 3. Create order (SalesOrder + item) - need customer
  if (createdCustomerId) {
    try {
      const orderNumber = `TEST-${Date.now()}`;
      const order = await prisma.salesOrder.create({
        data: {
          orderNumber,
          customerId: createdCustomerId,
          docType: "SALES_ORDER",
          status: "DRAFT",
          subtotal: 100,
          total: 100,
          items: {
            create: [
              {
                lineDescription: `${TEST_PREFIX}Line 1`,
                quantity: 1,
                unitPrice: 100,
                lineTotal: 100,
              },
            ],
          },
        },
      });
      createdOrderId = order.id;
      results.push({ name: "createOrder", status: "passed" });
    } catch (e) {
      results.push({ name: "createOrder", status: "failed", message: e instanceof Error ? e.message : "Create failed" });
    }
  } else {
    results.push({ name: "createOrder", status: "failed", message: "Skip: no customer" });
  }

  // 4. Update order
  if (createdOrderId) {
    try {
      await prisma.salesOrder.update({
        where: { id: createdOrderId },
        data: { projectName: `${TEST_PREFIX}Updated` },
      });
      results.push({ name: "updateOrder", status: "passed" });
    } catch (e) {
      results.push({ name: "updateOrder", status: "failed", message: e instanceof Error ? e.message : "Update failed" });
    }
  } else {
    results.push({ name: "updateOrder", status: "failed", message: "Skip: no order" });
  }

  // 5. Delete record (delete the test product)
  if (createdProductId) {
    try {
      await prisma.salesProduct.delete({ where: { id: createdProductId } });
      createdProductId = null;
      results.push({ name: "deleteRecord", status: "passed" });
    } catch (e) {
      results.push({ name: "deleteRecord", status: "failed", message: e instanceof Error ? e.message : "Delete failed" });
    }
  } else {
    results.push({ name: "deleteRecord", status: "failed", message: "Skip: no product" });
  }

  await cleanup();

  const passed = results.filter((t) => t.status === "passed").length;
  const total = results.length;
  return NextResponse.json({
    status: "completed",
    tests: results,
    passed,
    total,
  });
}
