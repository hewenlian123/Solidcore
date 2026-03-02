-- Sales Orders RLS scaffold (optional)
-- Enable and adjust these policies when RLS is enabled in your Supabase project.

-- alter table public.customers enable row level security;
-- alter table public.products enable row level security;
-- alter table public.sales_orders enable row level security;
-- alter table public.sales_order_items enable row level security;
-- alter table public.sales_order_payments enable row level security;
-- alter table public.sales_order_counters enable row level security;

-- Example permissive policy for authenticated users (replace in production):
-- create policy "sales_orders_read_authenticated"
-- on public.sales_orders
-- for select
-- to authenticated
-- using (true);

-- create policy "sales_orders_write_authenticated"
-- on public.sales_orders
-- for all
-- to authenticated
-- using (true)
-- with check (true);
