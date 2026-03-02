import { NextRequest, NextResponse } from "next/server";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();
    return NextResponse.json(
      {
        error:
          "Deprecated endpoint. Reorder is paused until reorder batches are migrated to variant_id.",
      },
      { status: 410 },
    );
  } catch (error) {
    console.error("GET /api/inventory/reorder error:", error);
    return NextResponse.json({ error: "Failed to load reorder list." }, { status: 500 });
  }
}

