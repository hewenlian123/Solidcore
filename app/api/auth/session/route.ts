import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, getSessionCookieName, getSessionFromRequest } from "@/lib/auth-session";
import { normalizeRole } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json({ data: session }, { status: 200 });
}

export async function PATCH(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const body = await request.json();
    const role = normalizeRole(String(body?.role ?? session.role));
    const nextToken = createSessionToken({ ...session, role });
    const response = NextResponse.json(
      { data: { userId: session.userId, name: session.name, role } },
      { status: 200 },
    );
    response.cookies.set({
      name: getSessionCookieName(),
      value: nextToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Failed to update session." }, { status: 500 });
  }
}

