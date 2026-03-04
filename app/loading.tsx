export default function AppLoading() {
  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="route-skeleton h-32" />
        ))}
      </div>
      <div className="route-skeleton h-64" />
      <div className="route-skeleton h-80" />
    </section>
  );
}
