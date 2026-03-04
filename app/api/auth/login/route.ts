import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth-users";
import { createSessionToken, getSessionCookieName } from "@/lib/auth-session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = String(body?.username ?? "");
    const password = String(body?.password ?? "");
    const user = authenticateUser(username, password);
    if (!user) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    const token = createSessionToken({
      userId: user.id,
      role: user.role,
      name: user.name,
    });

    const response = NextResponse.json(
      {
        data: {
          userId: user.id,
          role: user.role,
          name: user.name,
        },
      },
      { status: 200 },
    );
    response.cookies.set({
      name: getSessionCookieName(),
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Failed to login." }, { status: 500 });
  }
}

