import { NextRequest, NextResponse } from "next/server";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();
  const { id } = await params;
  const upstream = await fetch(new URL(`/api/after-sales/returns/${id}/pdf`, request.url), {
    method: "POST",
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });
  const payload = await upstream.json();
  return NextResponse.json(payload, { status: upstream.status });
}

export async function GET(request: NextRequest, { params }: Params) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();
  const { id } = await params;
  const url = new URL(`/api/after-sales/returns/${id}/pdf`, request.url);
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    url.searchParams.set(key, value);
  }
  const upstream = await fetch(url, {
    method: "GET",
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });
  const buffer = await upstream.arrayBuffer();
  return new NextResponse(Buffer.from(buffer), {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "application/pdf",
      "Content-Disposition": upstream.headers.get("Content-Disposition") || "inline; filename=\"return.pdf\"",
    },
  });
}
