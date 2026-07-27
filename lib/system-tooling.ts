import { NextResponse } from "next/server";

export function denyProductionSystemTooling() {
  if (process.env.NODE_ENV !== "production") return null;
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
