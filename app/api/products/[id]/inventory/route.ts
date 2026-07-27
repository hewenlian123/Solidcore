import { NextRequest, NextResponse } from "next/server";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function POST(request: NextRequest) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) return deny();
  return NextResponse.json(
    {
      code: "DIRECT_STOCK_EDIT_DISABLED",
      error:
        "Direct stock adjustments are disabled. Use Receiving, Fulfillment, Return disposition, or a documented Stock Count.",
    },
    { status: 410 },
  );
}
