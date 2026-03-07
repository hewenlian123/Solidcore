"use client";

import { PageHeader } from "@/components/design-system";

type PlaceholderPageProps = {
  title: string;
  description?: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="space-y-6">
      <PageHeader
        title={title}
        subtitle={description ?? "This section is not implemented yet. Connect business logic when ready."}
      />
      <div className="glass-card p-8 text-center">
        <p className="text-white/50">Placeholder — no business logic yet.</p>
      </div>
    </section>
  );
}
