export function AccessDenied() {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-lg backdrop-blur-xl">
      <h2 className="text-lg font-semibold text-white">Access denied</h2>
      <p className="mt-2 text-sm text-slate-400">Your current role cannot access this page. Switch roles or contact an administrator.</p>
    </section>
  );
}
