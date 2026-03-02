import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const { id } = await params;
    const body = await request.json();
    const name = body?.name !== undefined ? String(body.name || "").trim() : undefined;
    const description =
      body?.description !== undefined ? String(body.description || "").trim() : undefined;

    if (name !== undefined && !name) {
      return NextResponse.json({ error: "Group name cannot be empty." }, { status: 400 });
    }

    const data = await prisma.inventoryGroup.update({
      where: { id },
      data: {
        name,
        description: description === undefined ? undefined : description || null,
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "Group name already exists." }, { status: 409 });
    }
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }
    console.error("PATCH /api/inventory-groups/[id] error:", error);
    return NextResponse.json({ error: "Failed to update inventory group." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const { id } = await params;
    await prisma.$transaction(async (tx) => {
      await tx.product.updateMany({
        where: { groupId: id },
        data: { groupId: null },
      });
      await tx.inventoryGroup.delete({
        where: { id },
      });
    });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }
    console.error("DELETE /api/inventory-groups/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete inventory group." }, { status: 500 });
  }
}
