import { NextRequest, NextResponse } from "next/server";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();
  const { id } = await params;
  const upstream = await fetch(new URL(`/api/returns/${id}`, request.url), {
    method: "GET",
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });
  const payload = await upstream.json();
  return NextResponse.json(payload, { status: upstream.status });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();
  const { id } = await params;
  const body = await request.json();
  const upstream = await fetch(new URL(`/api/returns/${id}`, request.url), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify(body),
  });
  const payload = await upstream.json();
  return NextResponse.json(payload, { status: upstream.status });
}
