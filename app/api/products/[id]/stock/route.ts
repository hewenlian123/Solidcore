import { NextRequest, NextResponse } from "next/server";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const role = getRequestRole(request);
    if (!hasOneOf(role, ["ADMIN", "WAREHOUSE"])) {
      return deny();
    }
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing product ID." }, { status: 400 });
    }
    return NextResponse.json(
      {
        error:
          "Deprecated endpoint. Product-level stock updates are disabled. Use variant-level inventory endpoints.",
      },
      { status: 410 },
    );
  } catch (error) {
    console.error("PATCH /api/products/[id]/stock error:", error);
    return NextResponse.json({ error: "Stock update failed, please try again." }, { status: 500 });
  }
}
