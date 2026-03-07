# Solidcore Luxury SaaS UI Upgrade — Deliverable

**Constraint:** ADD ONLY. No business logic, API, or data model changes. Visual design and component consistency only.

---

## 1. Implementation order (safe phases)

1. **Global foundation** — CSS variables, background system, typography, buttons (globals.css + layout.tsx).
2. **Reusable components** — Unify GlassCard, GradientButton, PageHeader, StatusBadge, KPIBox, GlassInput, GlassTable; add SegmentControl and danger button variant.
3. **Page application** — All pages inherit the new background and typography via root layout and globals. Pages that already use `glass-card`, `ios-primary-btn`, `txt-primary`, etc. automatically get the updated luxury tokens. Phase 1/2 pages can incrementally adopt the new `components/ui` and `components/design-system` components where convenient.

---

## 2. Files changed

### Global

| File | Changes |
|------|--------|
| **app/globals.css** | Updated `:root` (--bg-mid, --bg-deep, --bg-gradient, --shadow, --shadow-soft, --accent); main `.glass-card` border `white/[0.10]` and shadow `0 20px 60px`; `.ios-secondary-btn` text `text-white/90`; added `.ios-danger-btn` (red glass); typography comment for txt-primary/secondary/muted. |
| **app/layout.tsx** | Premium dark gradient base (`#020617` → `#0f172a` → `#0b1220`); three radial glows (indigo top-left, cyan top-right, violet center); softer blur/opacity for glows. |

### Reusable components (components/ui)

| File | Changes |
|------|--------|
| **glass-card.tsx** | Border `white/[0.10]`, shadow `0_20px_60px_rgba(0,0,0,0.45)`; added `variant: "default" \| "soft"`; hover `border-white/[0.14]` and `bg-white/[0.06]`; softer inner gradient. |
| **gradient-button.tsx** | Added `variant: "danger"` (red glass); primary/secondary use `rounded-xl` and `active:scale-[0.97]`; secondary `text-white/90`. |
| **page-header.tsx** | Title `text-white/90`, subtitle `text-white/70`. |
| **status-badge.tsx** | New variants: draft, quoted, confirmed, ready, fulfilled, paid, cancelled, lowStock (plus existing success, warning, error, info); all as soft glass pills (`rounded-xl`, `backdrop-blur-xl`). |
| **kpi-box.tsx** | Label `text-white/70`, value `text-white/90`, subtitle `text-white/50`. |
| **glass-input.tsx** | Label `text-white/70`. |
| **glass-table.tsx** | Wrapper border `white/[0.10]`, gradient `from-white/[0.12]`; shadow `0_20px_60px`; header `text-white/70`, `border-b border-white/10`; body row `border-b border-white/10`, `duration-150`. |
| **segment-control.tsx** | **New.** SegmentControl for Quotes / Sales Orders–style toggles; glass container, gradient active segment. |

### Design system (components/design-system)

| File | Changes |
|------|--------|
| **GlassCard.tsx** | Aligned with ui/glass-card (border, shadow, hover). |
| **StatusBadge.tsx** | Same variant set as ui/status-badge; `rounded-xl`. |
| **index.ts** | Export SegmentControl and types from `../ui/segment-control`. |

---

## 3. Build status

- **TypeScript:** `npx tsc --noEmit` — **PASS** (exit 0).
- **Full build:** Recommended to run `npm run build` locally; typecheck confirms no type errors from these changes.

---

## 4. Pages updated

- **All pages** — New background (gradient + indigo/cyan/violet glows) and global typography/button tokens apply via **app/layout.tsx** and **app/globals.css**. No per-page edits were required for the background or for existing uses of `glass-card`, `ios-primary-btn`, `txt-primary`, etc.
- **Phase 1 / Phase 2 pages** (Dashboard, Sales Orders list/detail/editor, Fulfillment Queue, Pickup, Delivery, Picking, Packing, Products, Inventory, Reorder, Finance, Price List, Customers, Returns, Store Credit, Analytics, Purchasing, Reports, Settings) — Already using the shared classes where implemented; they now render with the updated luxury tokens. No layout or workflow changes.

---

## 5. Components to use going forward

| Component | Location | Use for |
|-----------|----------|--------|
| **GlassCard** | `components/ui/glass-card` or `design-system/GlassCard` | Page sections, KPI cards, filters, form panels, table wrappers. Use `variant="soft"` for nested/light panels. |
| **GradientButton** | `components/ui/gradient-button` | Primary (gradient), secondary (glass), danger (red glass). |
| **PageHeader** | `components/ui/page-header` | Page title + subtitle + actions. |
| **StatusBadge** | `components/ui/status-badge` | draft, quoted, confirmed, ready, fulfilled, paid, cancelled, lowStock, success, warning, error, info. |
| **KPIBox** | `components/ui/kpi-box` | Dashboard and list KPIs. |
| **GlassInput** | `components/ui/glass-input` | Form inputs (dark glass, label text-white/70). |
| **GlassTable** | `components/ui/glass-table` | Tables inside glass wrapper; use GlassTableHeaderRow and GlassTableRow for header/body. |
| **FilterChip** | `components/ui/filter-chip` | Inactive = glass, active = gradient. |
| **SegmentControl** | `components/ui/segment-control` | Quotes / Sales Orders–style toggle groups. |

---

## 6. Optional future cleanup

- **Duplicate components** — Both `components/ui` (kebab-case) and `components/design-system` (PascalCase) exist. Prefer importing from `@/components/ui` for new code; design-system can re-export from ui to avoid drift.
- **Legacy classes** — `linear-card`, `so-panel`, `so-modal-shell`, `so-entry-glass-card` remain valid; they already match the premium glass look. Can gradually replace with `<GlassCard>` where it simplifies markup.
- **Old ERP tables** — Any remaining solid white or harsh zebra tables can be wrapped in `GlassTable` and rows updated to use `border-b border-white/10` and `hover:bg-white/[0.06]`.

---

## 7. Summary

- **Global:** Dark gradient background and subtle indigo/cyan/violet glows applied in layout; glass card and button tokens updated in globals.css; danger button and typography hierarchy documented.
- **Components:** GlassCard (with soft variant), GradientButton (with danger), PageHeader, StatusBadge (extended variants), KPIBox, GlassInput, GlassTable, and new SegmentControl aligned with the luxury SaaS spec. Design-system GlassCard and StatusBadge kept in sync.
- **Logic/API/Data:** Unchanged. No workflows or data flow modified.
