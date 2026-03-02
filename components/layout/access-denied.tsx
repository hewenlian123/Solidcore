export function AccessDenied() {
  return (
    <section className="rounded-lg border border-slate-200/70 bg-white p-8 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
      <p className="mt-2 text-sm text-slate-500">Your current role cannot access this page. Switch roles or contact an administrator.</p>
    </section>
  );
}
