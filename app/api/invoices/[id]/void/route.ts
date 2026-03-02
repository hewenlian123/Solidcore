import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

    const invoice = await prisma.invoice.findUnique({ where: { id }, select: { id: true } });
    if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

    const updated = await prisma.invoice.update({
      where: { id },
      data: { status: "void" },
      select: { id: true, status: true },
    });

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (error) {
    console.error("POST /api/invoices/[id]/void error:", error);
    return NextResponse.json({ error: "Failed to void invoice." }, { status: 500 });
  }
}
