import { NextRequest, NextResponse } from "next/server";
import { COMPANY_SETTINGS } from "@/lib/company-settings";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

export async function GET(request: NextRequest) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "SALES"])) return deny();
  return NextResponse.json({ data: COMPANY_SETTINGS }, { status: 200 });
}
