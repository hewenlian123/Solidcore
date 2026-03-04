import { NextRequest, NextResponse } from "next/server";
import { SessionUser, getSessionFromRequest } from "@/lib/auth-session";
import { Role } from "@/lib/rbac";

export type RequestRole = Role | "UNAUTH";

export function getRequestUser(request: NextRequest): SessionUser | null {
  return getSessionFromRequest(request);
}

export function getRequestRole(request: NextRequest): RequestRole {
  return getRequestUser(request)?.role ?? "UNAUTH";
}

export function deny() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

export function hasOneOf(role: RequestRole, allowed: Role[]) {
  if (role === "UNAUTH") return false;
  return allowed.includes(role);
}
