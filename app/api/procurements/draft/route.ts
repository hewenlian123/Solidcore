import { NextRequest, NextResponse } from "next/server";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();
    return NextResponse.json(
      {
        error:
          "Deprecated endpoint. Procurement draft is paused until variant-level purchasing is implemented.",
      },
      { status: 410 },
    );
  } catch (error) {
    console.error("GET /api/procurements/draft error:", error);
    return NextResponse.json({ error: "Failed to generate purchase draft." }, { status: 500 });
  }
}
