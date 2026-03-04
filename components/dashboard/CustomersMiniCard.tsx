import { users } from "@/components/dashboard/usersAvatarMock";

type CustomersMiniProps = {
  newCustomers: { count: number; delta: string };
  returningCustomers: { count: number; delta: string };
};

export function CustomersMiniCard({ newCustomers, returningCustomers }: CustomersMiniProps) {
  return (
    <article className="glass-card glass-card-moderate px-5 py-5">
      <h3 className="glass-card-content text-[19px] font-semibold text-slate-900">Customers</h3>
      <div className="glass-card-content mt-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">New</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{newCustomers.count}</p>
          <p className="text-xs font-medium text-emerald-600">{newCustomers.delta}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Returning</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{returningCustomers.count}</p>
          <p className="text-xs font-medium text-emerald-600">{returningCustomers.delta}</p>
        </div>
      </div>
      <div className="glass-card-content mt-4 flex -space-x-2">
        {users.map((user) => (
          <span
            key={user.id}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white"
            style={{ background: user.color }}
          >
            {user.label}
          </span>
        ))}
      </div>
    </article>
  );
}
