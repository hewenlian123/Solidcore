import Link from "next/link";

export default function ReturnsPlaceholderPage() {
  return (
    <section className="space-y-4">
      <div className="glass-card p-8">
        <div className="glass-card-content">
          <h1 className="text-2xl font-semibold text-white">Returns</h1>
          <p className="mt-2 text-sm text-slate-400">Coming soon.</p>
          <Link href="/dashboard" className="mt-4 inline-flex text-sm font-medium text-blue-400 hover:text-blue-300">
            Back to Dashboard
          </Link>
        </div>
      </div>
    </section>
  );
}
