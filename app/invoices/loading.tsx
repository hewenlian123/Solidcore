export default function InvoicesLoading() {
  return (
    <section className="space-y-4">
      <div className="glass-card p-4">
        <div className="route-skeleton h-16 w-64" />
        <div className="route-skeleton mt-2 h-4 w-96" />
      </div>
      <div className="glass-card flex flex-wrap items-end gap-3 p-4">
        {Array.from({ length: 5 }).map((_, idx) => (
          <div key={idx} className="route-skeleton h-10 w-32" />
        ))}
      </div>
      <div className="glass-card overflow-hidden p-0">
        <div className="space-y-2 p-4">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div key={idx} className="route-skeleton h-12" />
          ))}
        </div>
      </div>
    </section>
  );
}
