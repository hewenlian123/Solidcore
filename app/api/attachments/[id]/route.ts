import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { id } = await params;
    const body = await request.json();
    const description = String(body?.description ?? "").trim();

    const data = await prisma.attachment.update({
      where: { id },
      data: { description: description || null },
    });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/attachments/[id] error:", error);
    return NextResponse.json({ error: "Failed to update note。" }, { status: 500 });
  }
}
