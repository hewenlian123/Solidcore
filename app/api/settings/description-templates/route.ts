import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureDescriptionTemplateSeeds } from "@/lib/description/templates";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type TemplatePayload = {
  id?: string;
  category?: string;
  templateJson?: string;
  enabled?: boolean;
};

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();

    await ensureDescriptionTemplateSeeds();

    const rows = await prisma.descriptionTemplate.findMany({
      orderBy: { category: "asc" },
    });
    return NextResponse.json({ data: rows }, { status: 200 });
  } catch (error) {
    console.error("GET /api/settings/description-templates error:", error);
    return NextResponse.json({ error: "Failed to load description templates." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN"])) return deny();

    const body = (await request.json()) as TemplatePayload;
    const category = String(body.category ?? "").trim();
    const templateJson = String(body.templateJson ?? "").trim();
    if (!category || !templateJson) {
      return NextResponse.json({ error: "Category and template JSON are required." }, { status: 400 });
    }

    try {
      const parsed = JSON.parse(templateJson);
      if (!parsed || !Array.isArray(parsed.lines)) {
        return NextResponse.json({ error: "Template JSON must include a lines array." }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Template JSON is invalid." }, { status: 400 });
    }

    const saved = await prisma.descriptionTemplate.upsert({
      where: { category },
      update: {
        templateJson,
        enabled: body.enabled !== undefined ? Boolean(body.enabled) : true,
      },
      create: {
        category,
        templateJson,
        enabled: body.enabled !== undefined ? Boolean(body.enabled) : true,
      },
    });

    return NextResponse.json({ data: saved }, { status: 200 });
  } catch (error) {
    console.error("POST /api/settings/description-templates error:", error);
    return NextResponse.json({ error: "Failed to save description template." }, { status: 500 });
  }
}

