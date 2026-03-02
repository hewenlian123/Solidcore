import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) {
      return deny();
    }

    const warehouses = await prisma.warehouse.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        address: true,
        managerName: true,
      },
    });

    return NextResponse.json({ data: warehouses }, { status: 200 });
  } catch (error) {
    console.error("GET /api/warehouses error:", error);
    return NextResponse.json({ error: "Failed to fetch warehouse data." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) {
      return deny();
    }

    const body = await request.json();
    const name = String(body?.name ?? "").trim();
    const address = String(body?.address ?? "").trim();
    const managerName = String(body?.managerName ?? "").trim();
    const today = new Date().toISOString().slice(0, 10);
    const defaultBaseName = `Warehouse ${today}`;

    let finalName = name;
    if (!finalName) {
      const existing = await prisma.warehouse.findMany({
        where: { name: { startsWith: defaultBaseName } },
        select: { name: true },
      });
      if (existing.length === 0) {
        finalName = defaultBaseName;
      } else {
        const pattern = new RegExp(`^${defaultBaseName}(?: #(\\d+))?$`);
        let maxSequence = 1;
        for (const item of existing) {
          const matched = item.name.match(pattern);
          if (!matched) continue;
          const n = matched[1] ? Number.parseInt(matched[1], 10) : 1;
          if (Number.isFinite(n)) maxSequence = Math.max(maxSequence, n);
        }
        finalName = `${defaultBaseName} #${maxSequence + 1}`;
      }
    }

    const data = await prisma.warehouse.create({
      data: {
        // Keep creation flexible for quick setup.
        name: finalName,
        address: address || "-",
        managerName: managerName || "-",
      },
      select: {
        id: true,
        name: true,
        address: true,
        managerName: true,
      },
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/warehouses error:", error);
    return NextResponse.json({ error: "Failed to create warehouse." }, { status: 500 });
  }
}
