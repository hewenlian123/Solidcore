import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json({ data: session }, { status: 200 });
}

export async function PATCH(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json(
    { error: "Session roles cannot be changed by the signed-in user." },
    { status: 405, headers: { Allow: "GET" } },
  );
}
