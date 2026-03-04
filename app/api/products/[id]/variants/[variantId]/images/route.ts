import { mkdir, readdir, rm, unlink, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string; variantId: string }>;
};

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function ensureVariant(productId: string, variantId: string) {
  return prisma.productVariant.findFirst({
    where: { id: variantId, productId },
    select: { id: true, imageUrl: true },
  });
}

async function clearVariantImageFiles(variantId: string) {
  const variantDir = path.join(process.cwd(), "public", "uploads", "products", variantId);
  await mkdir(variantDir, { recursive: true });
  const files = await readdir(variantDir).catch(() => []);
  await Promise.all(files.map((name) => unlink(path.join(variantDir, name)).catch(() => undefined)));
  return variantDir;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const { id: productId, variantId } = await params;
    const variant = await ensureVariant(productId, variantId);
    if (!variant) return NextResponse.json({ error: "Variant not found." }, { status: 404 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Please upload a valid image file." }, { status: 400 });
    }

    const mime = String(file.type || "").toLowerCase();
    const ext = ALLOWED_MIME[mime];
    if (!ext) {
      return NextResponse.json({ error: "Only jpg, png, and webp files are supported." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const variantDir = await clearVariantImageFiles(variantId);
    const fileName = `image.${ext}`;
    const fullPath = path.join(variantDir, fileName);
    await writeFile(fullPath, buffer);

    const imageUrl = `/uploads/products/${variantId}/${fileName}`;
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { imageUrl },
    });

    return NextResponse.json({ data: { imageUrl } }, { status: 201 });
  } catch (error) {
    console.error("POST /api/products/[id]/variants/[variantId]/images error:", error);
    return NextResponse.json({ error: "Failed to upload variant image." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();

    const { id: productId, variantId } = await params;
    const variant = await ensureVariant(productId, variantId);
    if (!variant) return NextResponse.json({ error: "Variant not found." }, { status: 404 });

    const variantDir = path.join(process.cwd(), "public", "uploads", "products", variantId);
    await rm(variantDir, { recursive: true, force: true }).catch(() => undefined);

    await prisma.productVariant.update({
      where: { id: variantId },
      data: { imageUrl: null },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/products/[id]/variants/[variantId]/images error:", error);
    return NextResponse.json({ error: "Failed to delete variant image." }, { status: 500 });
  }
}
