import { NextRequest, NextResponse } from "next/server";
import { Role, normalizeRole } from "@/lib/rbac";

export function getRequestRole(request: NextRequest): Role {
  return normalizeRole(request.headers.get("x-user-role"));
}

export function deny() {
  return NextResponse.json({ error: "You do not have permission to access this resource." }, { status: 403 });
}

export function hasOneOf(role: Role, allowed: Role[]) {
  return allowed.includes(role);
}
