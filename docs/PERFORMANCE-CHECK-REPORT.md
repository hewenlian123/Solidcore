# Solidcore — Performance Check Report

**Date:** Generated from codebase inspection and build verification.  
**Scope:** Navigation performance, sidebar routing, large components, layout, Quick Sale, Dashboard.  
**Constraints:** No UI redesign, no business-logic changes.

---

## 1) Dev vs prod

### Build status
- **`npm run build`** — **PASSES** (after fixing `app/sales-orders/[id]/page.tsx` JSX structure).
- **`npm start`** — Not run in this session; recommend running locally to compare.

### Recommendation
- **Development (`npm run dev`):** Slower navigation is expected (HMR, unminified bundles, source maps, React strict mode double-renders). If sidebar clicks feel slow even after a short delay, the cause is likely in app code (see below).
- **Production (`npm start`):** Run after `npm run build` and compare sidebar click → paint time. If nav is fast in prod but slow in dev, the slowness is **mainly from dev mode**.

**Action:** Compare click-to-content time on Dashboard ↔ Sales ↔ Inventory with `npm run dev` vs `npm start` and note whether slowness is dev-only.

---

## 2) Sidebar navigation

### Verified
- **Client-side navigation:** Sidebar uses Next.js `<Link href={...} prefetch={true}>` for all main and child items (AppShell ~403, ~439). No full page reloads on sidebar click.
- **No `window.location` for nav:** `window.location.href` is used only for **logout** (AppShell ~651) to force a full reload after session clear — intentional.
- **Search results:** Use `router.push()` for product/order/customer results; these are not sidebar links and do not block sidebar nav.

### Already optimized (from earlier work)
- **RoleProvider** no longer refetches session on every pathname change. Session runs **once on mount** (`useEffect(..., [])`). This was a major cause of slow nav: every click used to trigger `/api/auth/session` and loading state.

**Conclusion:** Sidebar is client-side; no further nav changes required for this check.

---

## 3) Large components

| Area | Finding | Severity |
|------|--------|----------|
| **Dashboard** | useMemo added for `dashboardKpis`, `dashboardTrend`, `dashboardTopProducts`, `dashboardRecentOrders`, `sectionReveal`. Single `useQuery` for dashboard; does not block route change. | Low (already improved) |
| **Inventory** | Summary page: one fetch in `useEffect([role])`, then table. No virtualization; table size depends on API. | Medium if rows are large |
| **Sales Orders (orders list)** | Uses React Query with `placeholderData: keepPreviousData`. Multiple queries (orders, snapshot, alerts). Table renders all rows returned by API. | Medium for large result sets |
| **Sales Order Detail (`[id]`)** | Very large component (~3580 lines), many modals and tabs. Fixed JSX structure (fragment/ternary) so build succeeds. | High (bundle size / parse cost) |
| **Quick Sale (entry-content)** | ~1558 lines. `filteredProducts` is useMemo; product list limited to 12 initially (`PRODUCT_LIST_INITIAL_ROWS`) with “Show more”. Many useEffects for URL sync and loading. | Medium |

### Heavy patterns observed
- **Charts:** Dashboard uses Recharts (SalesTrendCard, SalesByRegionCard) and SparklineAnimated. No dynamic import yet; they load with the dashboard chunk.
- **No list virtualization** on orders table, inventory table, or product list (beyond initial 12 in Quick Sale).
- **No pagination** on orders list (relies on API returning a bounded set).

---

## 4) Global layout

### Inspected
- **app/layout.tsx** — Static structure; no pathname/route logic. Wraps app with `AppQueryProvider` → `RoleProvider` → `AppShell` → `children`.
- **RoleProvider** — Session load runs once on mount; no dependency on pathname. Context value memoized with `useMemo([role, userName, authenticated, loading, setRole])`.
- **AppShell** — Uses `usePathname()` for: title, login/sales-editor checks, sidebar active state. Re-renders on route change are expected and lightweight (no session refetch, no heavy compute).
- **visibleItems** — Memoized with `useMemo(..., [role])`. Prefetch effect runs when `authenticated`/`role`/`router` change, not on every pathname change.

**Conclusion:** No global layout change causes unnecessary heavy work on every route change. Session fix was the main win.

---

## 5) Quick Sale (entry-content)

### Current behavior
- **Product list:** `filteredProducts` from useMemo (filters by category + search). Only first 12 shown until “Show more” (`productListShowAll`). Reduces initial render cost.
- **Search:** Quick search results limited to 6 (`quickSearchResults.slice(0, 6)`).
- **Many useEffects:** Used for URL sync, loading customers/products/salespeople, and draft sync. Dependencies are appropriate; no obvious infinite loops.

### Possible improvements (optional, not applied)
- Memoize list item components so that when `filteredProducts` reference is stable, list items don’t re-render.
- Virtualize product list if “Show more” is used often and list grows large (e.g. 100+ products).

---

## 6) Dashboard

### Current behavior
- **Data:** One `useQuery(["dashboard", role])`; data is memoized into KPI/trend/top-products/recent-orders arrays and `sectionReveal`.
- **Charts:** SalesTrendCard and SalesByRegionCard use Recharts; no dynamic import. They load in the same chunk as the dashboard page.

### Optional improvements (not applied)
- **Dynamic import for chart components:** e.g. `const SalesTrendCard = dynamic(() => import('...').then(m => m.SalesTrendCard), { loading: () => <CardSkeleton /> })` to shrink initial dashboard JS and speed first paint.
- **React.memo on card components** (KpiCard, SalesTrendCard, etc.) so they skip re-render when parent re-renders with same props.

---

## 7) Summary and files changed

### Slowness: dev-only or production too?
- **Not verified in this run.** Need to run `npm start` and compare with `npm run dev` on the same routes.
- **Likely:** If nav is still slow in **production**, the main remaining cost is large JS bundles (e.g. sales-orders [id], dashboard charts, entry-content) and/or large lists without virtualization.

### Heaviest components/pages
1. **app/sales-orders/[id]/page.tsx** — Very large; many modals/tabs; big parse/compile cost.
2. **app/sales-orders/entry-content.tsx** — Quick Sale; large component and many effects.
3. **Dashboard** — Recharts and multiple cards; improved with useMemo, charts still in main chunk.
4. **app/orders/page.tsx** — Full orders table without virtualization.
5. **app/products/page.tsx** — Large (3700+ lines) product table/list.

### Rerenders reduced
- **RoleProvider:** Session no longer refetched on every pathname change; layout and children no longer blocked by session load on each nav.
- **Dashboard:** Derived data (KPI arrays, trend, top products, recent orders, sectionReveal) memoized so references are stable when query data is unchanged.

### Navigation improvements made
- **Session load only on mount** in RoleProvider (no pathname in effect deps).
- **Sidebar:** Confirmed client-side `Link` usage; no change needed.
- **Build fix:** Restored correct JSX structure in sales-orders [id] so production build succeeds and route can load.

### Files changed in this pass
| File | Change |
|------|--------|
| **app/sales-orders/[id]/page.tsx** | Restored closing `</>` and `)}` for the `{!data ? ... : (<> ... </> )}` block so modals and `PDFPreviewModal` are siblings of the main content. Fixes build error “Expected '</', got 'ident'” and allows `npm run build` to succeed. |

### Files previously changed (performance-related)
| File | Change |
|------|--------|
| **components/layout/role-provider.tsx** | Session effect deps changed from `[pathname, router]` to `[]`; run once on mount. Removed `usePathname` to avoid re-subscribing on route change. |
| **app/dashboard/page.tsx** | useMemo for `dashboardKpis`, `dashboardTrend`, `dashboardTopProducts`, `dashboardRecentOrders`, `sectionReveal`. |
| **app/inventory/loading.tsx** | Added loading skeleton for `/inventory`. |

---

## Recommended next steps (optional)

1. **Measure:** Run `npm start` and compare time-to-interactive for Dashboard vs Sales vs Inventory with `npm run dev`.
2. **Production profile:** Use React DevTools Profiler or Chrome Performance on a production build to see which components take the most time on route change.
3. **Code-splitting:** Dynamically import heavy route content (e.g. sales-order detail, dashboard charts) to reduce initial JS.
4. **Lists:** Add virtualization or pagination for orders list and inventory if response sizes are large.
