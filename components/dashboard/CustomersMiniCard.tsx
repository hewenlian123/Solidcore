import { users } from "@/components/dashboard/usersAvatarMock";

type CustomersMiniProps = {
  newCustomers: { count: number; delta: string };
  returningCustomers: { count: number; delta: string };
};

export function CustomersMiniCard({ newCustomers, returningCustomers }: CustomersMiniProps) {
  return (
    <article className="glass-card glass-card-moderate px-5 py-5">
      <h3 className="glass-card-content text-[19px] font-semibold text-white">Customers</h3>
      <div className="glass-card-content mt-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-white/[0.06] border border-white/[0.08] p-3">
          <p className="text-xs txt-muted">New</p>
          <p className="mt-1 text-xl font-semibold text-white">{newCustomers.count}</p>
          <p className="text-xs font-medium text-emerald-400">{newCustomers.delta}</p>
        </div>
        <div className="rounded-2xl bg-white/[0.06] border border-white/[0.08] p-3">
          <p className="text-xs txt-muted">Returning</p>
          <p className="mt-1 text-xl font-semibold text-white">{returningCustomers.count}</p>
          <p className="text-xs font-medium text-emerald-400">{returningCustomers.delta}</p>
        </div>
      </div>
      <div className="glass-card-content mt-4 flex -space-x-2">
        {users.map((user) => (
          <span
            key={user.id}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-black/40 text-xs font-semibold text-white"
            style={{ background: user.color }}
          >
            {user.label}
          </span>
        ))}
      </div>
    </article>
  );
}
