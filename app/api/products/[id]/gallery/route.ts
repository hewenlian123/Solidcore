import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";
import { uploadBinary } from "@/lib/storage";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    const { id } = await params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Please upload a valid image." }, { status: 400 });
    }
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const uploaded = await uploadBinary(buffer, file.name, `products/${id}`, file.type || "image/jpeg");

    await prisma.attachment.create({
      data: {
        productId: id,
        fileUrl: uploaded.url,
        fileType: file.type || "image/jpeg",
        uploadedBy: role,
      },
    });

    const product = await prisma.product.update({
      where: { id },
      data: { galleryImageUrl: uploaded.url },
    });

    return NextResponse.json({ data: product }, { status: 201 });
  } catch (error) {
    console.error("POST /api/products/[id]/gallery error:", error);
    return NextResponse.json({ error: "Failed to upload product image." }, { status: 500 });
  }
}
