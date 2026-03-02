import { OrderStatus, ProductCategory } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type ItemInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
  lengthMm?: number;
  widthMm?: number;
  note?: string;
};

const areaBasedCategories = new Set<ProductCategory>(["WINDOW", "MIRROR"]);

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) {
      return deny();
    }

    const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";

    const orders = await prisma.order.findMany({
      where: includeArchived ? undefined : { archivedAt: null },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            subtotal: true,
            lengthMm: true,
            widthMm: true,
            product: {
              select: {
                id: true,
                name: true,
                barcode: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const data =
      role === "WAREHOUSE"
        ? orders.map((order) => ({ ...order, totalAmount: null, paidAmount: null }))
        : orders;
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/orders error:", error);
    return NextResponse.json({ error: "Failed to fetch order list." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) {
      return deny();
    }

    const body = await request.json();
    const customerId = String(body?.customerId ?? "").trim();
    const rawItems = Array.isArray(body?.items) ? (body.items as ItemInput[]) : [];

    if (!customerId) {
      return NextResponse.json({ error: "Please select a customer." }, { status: 400 });
    }
    if (!rawItems.length) {
      return NextResponse.json({ error: "Please add at least one product item." }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found." }, { status: 400 });
    }

    const productIds = rawItems.map((item) => String(item.productId ?? "").trim()).filter(Boolean);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        category: true,
      },
    });
    const productMap = new Map(products.map((product) => [product.id, product]));

    const parsedItems = rawItems.map((item, idx) => {
      const row = idx + 1;
      const productId = String(item.productId ?? "").trim();
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const product = productMap.get(productId);

      if (!product) {
        throw new Error(`Row ${row} product does not exist.`);
      }
      if (Number.isNaN(quantity) || quantity <= 0) {
        throw new Error(`Row ${row} quantity must be greater than 0.`);
      }
      if (Number.isNaN(unitPrice) || unitPrice < 0) {
        throw new Error(`Row ${row} invalid unit price format.`);
      }

      const lengthMm = item.lengthMm ? Number(item.lengthMm) : 0;
      const widthMm = item.widthMm ? Number(item.widthMm) : 0;
      const isAreaBased = areaBasedCategories.has(product.category);

      if (isAreaBased && (lengthMm <= 0 || widthMm <= 0)) {
        throw new Error(`Row ${row} requires length and width.`);
      }

      const areaSqm = isAreaBased ? (lengthMm / 1000) * (widthMm / 1000) : null;
      const subtotal = isAreaBased
        ? quantity * (areaSqm ?? 0) * unitPrice
        : quantity * unitPrice;
      const stockDeductionQty = isAreaBased ? quantity * (areaSqm ?? 0) : quantity;

      return {
        productId,
        quantity,
        unitPrice,
        lengthMm: isAreaBased ? lengthMm : null,
        widthMm: isAreaBased ? widthMm : null,
        areaSqm,
        subtotal,
        stockDeductionQty,
      };
    });

    const totalAmount = parsedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const orderNo = `OD${Date.now()}`;

    const order = await prisma.order.create({
      data: {
        orderNo,
        customerId,
        totalAmount,
        status: OrderStatus.PENDING_PRODUCTION,
        items: {
          create: parsedItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lengthMm: item.lengthMm,
            widthMm: item.widthMm,
            areaSqm: item.areaSqm,
            subtotal: item.subtotal,
            stockDeductionQty: item.stockDeductionQty,
          })),
        },
        activities: {
          create: {
            fromStatus: null,
            toStatus: OrderStatus.PENDING_PRODUCTION,
            operator: role,
            note: "OrderCreate",
          },
        },
      },
      include: {
        customer: {
          select: { id: true, name: true, phone: true },
        },
        items: true,
      },
    });

    return NextResponse.json({ data: order }, { status: 201 });
  } catch (error) {
    console.error("POST /api/orders error:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create order。" }, { status: 500 });
  }
}
