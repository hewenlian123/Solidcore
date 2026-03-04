import { NextRequest, NextResponse } from "next/server";
import { deny, getRequestRole, hasOneOf } from "@/lib/server-role";

function withAfterSalesDomain(url: URL) {
  const next = new URL(url.toString());
  if (!next.searchParams.get("domain")) {
    next.searchParams.set("domain", "after-sales");
  }
  return next;
}

export async function GET(request: NextRequest) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();
  const url = new URL("/api/returns", request.url);
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    url.searchParams.set(key, value);
  }
  const upstream = await fetch(withAfterSalesDomain(url), {
    method: "GET",
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });
  const payload = await upstream.json();
  return NextResponse.json(payload, { status: upstream.status });
}

export async function POST(request: NextRequest) {
  const role = getRequestRole(request);
  if (!hasOneOf(role, ["ADMIN", "SALES", "WAREHOUSE"])) return deny();
  const body = await request.json();
  const upstream = await fetch(withAfterSalesDomain(new URL("/api/returns", request.url)), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({
      ...body,
      domain: body?.domain ?? "after-sales",
    }),
  });
  const payload = await upstream.json();
  return NextResponse.json(payload, { status: upstream.status });
}
