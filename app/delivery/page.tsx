"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";

export default function DeliverySchedulePage() {
  return (
    <section className="space-y-6">
      <header className="linear-card p-8">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-slate-100 p-2 text-slate-700">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Delivery Schedule</h1>
            <p className="mt-1 text-sm text-slate-500">
              Central schedule view for outbound deliveries. This is a lightweight route placeholder wired into
              navigation.
            </p>
          </div>
        </div>
      </header>

      <article className="linear-card p-8">
        <p className="text-sm text-slate-600">
          Use <Link href="/outbound" className="font-medium text-slate-900 underline">Outbound Queue</Link> for active operational updates.
        </p>
      </article>
    </section>
  );
}
