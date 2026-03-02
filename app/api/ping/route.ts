import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("pg_tables")
    .select("*")
    .limit(1);

  return NextResponse.json({
    success: !error,
    error: error?.message ?? null,
    data,
  });
}
