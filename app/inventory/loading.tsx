export default function InventoryLoading() {
  return (
    <section className="space-y-6">
      <div className="route-skeleton h-24 w-full max-w-md" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="route-skeleton h-28" />
        ))}
      </div>
      <div className="route-skeleton h-[320px] w-full" />
    </section>
  );
}
