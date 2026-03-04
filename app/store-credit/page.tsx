import Link from "next/link";

export default function StoreCreditPlaceholderPage() {
  return (
    <section className="space-y-4">
      <div className="linear-card p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Store Credit</h1>
        <p className="mt-2 text-sm text-slate-500">Coming soon.</p>
        <Link href="/dashboard" className="mt-4 inline-flex text-sm font-medium text-blue-600 hover:text-blue-700">
          Back to Dashboard
        </Link>
      </div>
    </section>
  );
}
