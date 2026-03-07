# Solidcore Dark Glass UI Design System

Use the **dark gradient background** and **glassmorphism** components for all pages so the app stays visually consistent.

## Design rules

- **Cards:** `bg-white/5`, `border-white/10`, `backdrop-blur-xl`, `rounded-2xl`
- **Buttons:** Primary = gradient (indigo → cyan). Secondary = glass (`bg-white/5`, `border-white/10`, `hover:bg-white/10`)
- **Tables:** Inside a glass container; header row `bg-white/5`; data rows `hover:bg-white/10`
- **Hover (general):** `hover:bg-white/10` for interactive surfaces

## Components

Import from `@/components/design-system`:

```tsx
import {
  GlassCard,
  GlassPanel,
  GradientButton,
  GlassInput,
  GlassSelect,
  FilterChip,
  StatusBadge,
  GlassTableRoot,
  GlassTableHeaderRow,
  GlassTableBodyRow,
  GlassTableTable,
  GlassTableTableHeader,
  GlassTableTableBody,
  GlassTableTableHead,
  GlassTableTableCell,
  KPIBox,
  PageHeader,
} from "@/components/design-system";
```

### GlassCard

Main content cards. Optional hover state.

```tsx
<GlassCard hover className="p-6">
  <h2>Section title</h2>
  <p>Content</p>
</GlassCard>
```

### GlassPanel

Panels and modals. Use `strong` for dialogs.

```tsx
<GlassPanel strong className="p-6">
  Modal content
</GlassPanel>
```

### GradientButton

Primary (gradient) or secondary (glass). Sizes: `sm`, `default`, `lg`.

```tsx
<GradientButton variant="primary">Save</GradientButton>
<GradientButton variant="secondary">Cancel</GradientButton>
```

### GlassInput

Text input with glass styling. Optional `label` and `error`.

```tsx
<GlassInput label="Search" placeholder="Type here..." />
<GlassInput label="Email" type="email" error={errors.email} />
```

### GlassSelect

Select with glass styling. Use `options` or `children` for options.

```tsx
<GlassSelect
  label="Status"
  options={[
    { value: "ALL", label: "All" },
    { value: "ACTIVE", label: "Active" },
  ]}
  value={status}
  onChange={(e) => setStatus(e.target.value)}
/>
```

### FilterChip

Toggle chips: inactive = glass, active = gradient.

```tsx
<FilterChip active={filter === "ALL"} onClick={() => setFilter("ALL")}>
  All
</FilterChip>
```

### StatusBadge

Semantic badges. Variants: `default`, `success`, `warning`, `error`, `info`.

```tsx
<StatusBadge variant="success">Paid</StatusBadge>
<StatusBadge variant="warning">Pending</StatusBadge>
<StatusBadge variant="error">Overdue</StatusBadge>
```

### GlassTable

Table inside a glass card. Use `GlassTableRoot` as wrapper, `GlassTableHeaderRow` for thead row, and `TableRow` (or `GlassTableBodyRow`) for tbody rows.

```tsx
<GlassTableRoot>
  <GlassTableTable>
    <GlassTableTableHeader>
      <GlassTableHeaderRow>
        <GlassTableTableHead className="text-slate-400">Name</GlassTableTableHead>
        <GlassTableTableHead className="text-slate-400">Status</GlassTableTableHead>
      </GlassTableHeaderRow>
    </GlassTableTableHeader>
    <GlassTableTableBody>
      {rows.map((row) => (
        <GlassTableBodyRow key={row.id}>
          <GlassTableTableCell className="text-white">{row.name}</GlassTableTableCell>
          <GlassTableTableCell><StatusBadge variant="success">{row.status}</StatusBadge></GlassTableTableCell>
        </GlassTableBodyRow>
      ))}
    </GlassTableTableBody>
  </GlassTableTable>
</GlassTableRoot>
```

### KPIBox

Small metric cards. Optional `subtitle`. Use `as="button"` for clickable KPIs.

```tsx
<KPIBox label="This Month Sales" value="$12,345.00" />
<KPIBox label="Orders" value={42} subtitle="Last 30 days" />
<KPIBox as="button" label="Low Stock" value={3} onClick={() => router.push("/inventory")} />
```

### PageHeader

Page title, optional subtitle, and optional actions (buttons).

```tsx
<PageHeader
  title="Order Management"
  subtitle="Manage quotes and sales orders."
  actions={
    <>
      <GradientButton variant="primary">New Order</GradientButton>
      <GradientButton variant="secondary">Export</GradientButton>
    </>
  }
/>
```

## Page layout pattern

1. **Background:** Use the app shell’s dark gradient; no extra wrapper needed.
2. **Header:** `GlassCard` with `PageHeader` inside, or `PageHeader` inside a `GlassCard`.
3. **Filters / toolbar:** `GlassCard` with `GlassInput`, `FilterChip`s, and actions.
4. **Main content:** `GlassTableRoot` for tables, or `GlassCard` for other content.
5. **KPIs:** `GlassCard` containing a grid of `KPIBox` components.

## Ensuring future pages use this system

- Prefer components from `@/components/design-system` over raw `className` strings for cards, buttons, inputs, chips, tables, and headers.
- For one-off layouts you can still use global utility classes (e.g. `glass-card`, `ios-primary-btn`, `so-chip`, `so-chip-active`) from `app/globals.css`, but the design-system components are the canonical API and support props (e.g. `FilterChip` active state, `StatusBadge` variant).
- When adding new pages, use `PageHeader`, `GlassCard`, `GradientButton`, `GlassInput` / `GlassSelect`, `FilterChip`, `StatusBadge`, `GlassTableRoot` + table parts, and `KPIBox` as appropriate.
