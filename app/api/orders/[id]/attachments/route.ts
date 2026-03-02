import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { uploadBinary } from "@/lib/storage";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { id } = await params;
    const data = await prisma.attachment.findMany({
      where: { orderId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("GET /api/orders/[id]/attachments error:", error);
    return NextResponse.json({ error: "Failed to fetch attachments。" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();

    const { id } = await params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Please upload a valid file." }, { status: 400 });
    }
    const description = String(form.get("description") ?? "").trim();
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const uploaded = await uploadBinary(buffer, file.name, `orders/${id}`, file.type || "application/octet-stream");

    const attachment = await prisma.attachment.create({
      data: {
        orderId: id,
        fileUrl: uploaded.url,
        fileType: file.type || "application/octet-stream",
        description: description || null,
        uploadedBy: role,
      },
    });
    return NextResponse.json({ data: attachment }, { status: 201 });
  } catch (error) {
    console.error("POST /api/orders/[id]/attachments error:", error);
    return NextResponse.json({ error: "Failed to upload attachment." }, { status: 500 });
  }
}
