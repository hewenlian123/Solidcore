export default function ProductsLoading() {
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="route-skeleton h-20" />
        ))}
      </div>
      <div className="route-skeleton h-28" />
      <div className="glass-card overflow-hidden p-0">
        <div className="space-y-2 p-4">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div key={idx} className="route-skeleton h-10" />
          ))}
        </div>
      </div>
    </section>
  );
}
