export default function DashboardLoading() {
  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="route-skeleton h-40" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-12">
        <div className="route-skeleton h-[360px] 2xl:col-span-8" />
        <div className="route-skeleton h-[360px] 2xl:col-span-4" />
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-12">
        <div className="route-skeleton h-[320px] 2xl:col-span-8" />
        <div className="space-y-6 2xl:col-span-4">
          <div className="route-skeleton h-[150px]" />
          <div className="route-skeleton h-[150px]" />
        </div>
      </div>
    </section>
  );
}
