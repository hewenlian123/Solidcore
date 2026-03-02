import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) {
      return deny();
    }

    const { id } = await context.params;
    const warehouseId = String(id ?? "").trim();
    if (!warehouseId) {
      return NextResponse.json({ error: "Warehouse id is required." }, { status: 400 });
    }

    await prisma.warehouse.delete({
      where: { id: warehouseId },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Warehouse not found." }, { status: 404 });
      }
      if (error.code === "P2003") {
        return NextResponse.json(
          { error: "Cannot delete warehouse because related records still exist." },
          { status: 409 },
        );
      }
    }
    console.error("DELETE /api/warehouses/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete warehouse." }, { status: 500 });
  }
}
