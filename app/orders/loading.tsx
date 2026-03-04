export default function OrdersLoading() {
  return (
    <section className="space-y-4">
      <div className="space-y-3 border-b border-slate-200 pb-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="route-skeleton h-16" />
          <div className="route-skeleton h-16" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="route-skeleton h-20" />
          ))}
        </div>
      </div>

      <div className="route-skeleton h-28" />

      <div className="linear-card overflow-hidden p-0">
        <div className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="route-skeleton h-10" />
          ))}
        </div>
      </div>
    </section>
  );
}
