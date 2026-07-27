"use client";

import { AlertTriangle, ArrowRight, Package, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OperationalRow } from "@/components/ui/operational-row";
import { SearchField } from "@/components/ui/search-field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { StatusLabel } from "@/components/ui/status-label";
import { EmptyState, ErrorState, LoadingState, SuccessState } from "@/components/ui/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";

const palette = [
  ["Canvas", "#F6F4EF", "bg-canvas"],
  ["Surface", "#FFFEFB", "bg-surface"],
  ["Selected", "#E7E0D5", "bg-selected"],
  ["Navigation", "#ECE9E1", "bg-navigation"],
  ["Action", "#292A26", "bg-action"],
  ["Accent", "#836C4F", "bg-accent"],
] as const;

export function UISystemShowcase() {
  return (
    <div className="sc-workspace">
      <header className="border-b border-divider pb-6">
        <p className="text-sm font-semibold text-accent">UI-1C</p>
        <h1 className="sc-page-title mt-1">Architectural Warm Minimal</h1>
        <p className="mt-1 text-sm text-foreground-secondary">SolidCore interface foundation</p>
      </header>

      <section className="border-b border-divider py-7" aria-labelledby="palette-title">
        <h2 id="palette-title" className="sc-section-title">Color</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {palette.map(([label, hex, colorClass]) => (
            <div key={label} className="flex items-center gap-3 border-b border-divider py-3">
              <span className={`h-10 w-10 rounded-sc border border-border ${colorClass}`} />
              <span>
                <span className="block text-sm font-semibold text-foreground">{label}</span>
                <span className="block text-xs text-foreground-secondary">{hex}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-divider py-7" aria-labelledby="actions-title">
        <h2 id="actions-title" className="sc-section-title">Actions</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button><Plus aria-hidden="true" className="h-4 w-4" />Create Sale</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Quiet</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Saving</Button>
          <Tooltip content="Search orders">
            <Button variant="secondary" size="icon" aria-label="Search orders">
              <Search aria-hidden="true" className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </section>

      <section className="border-b border-divider py-7" aria-labelledby="forms-title">
        <h2 id="forms-title" className="sc-section-title">Fields</h2>
        <div className="mt-4 grid max-w-3xl gap-4 md:grid-cols-2">
          <Field label="Customer" htmlFor="system-customer" required>
            <Input id="system-customer" placeholder="Search customer" />
          </Field>
          <Field label="Reference" htmlFor="system-reference" hint="Optional customer PO">
            <Input id="system-reference" placeholder="PO number" />
          </Field>
          <div className="md:col-span-2">
            <SearchField label="Search products" placeholder="Search products" />
          </div>
          <div className="md:col-span-2">
            <Field label="Order note" htmlFor="system-note">
              <Textarea id="system-note" placeholder="Add an operational note" />
            </Field>
          </div>
        </div>
      </section>

      <section className="border-b border-divider py-7" aria-labelledby="status-title">
        <h2 id="status-title" className="sc-section-title">Status and Severity</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusLabel>Draft</StatusLabel>
          <StatusLabel tone="info">Confirmed</StatusLabel>
          <StatusLabel tone="success">Ready</StatusLabel>
          <StatusLabel tone="warning">Needs review</StatusLabel>
          <StatusLabel tone="blocking">Blocked</StatusLabel>
          <StatusLabel tone="critical">Failed</StatusLabel>
          <Badge variant="secondary">12 items</Badge>
        </div>
      </section>

      <section className="border-b border-divider py-7" aria-labelledby="rows-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="rows-title" className="sc-section-title">Operational Rows</h2>
          <Button variant="secondary" size="sm">View all</Button>
        </div>
        <div className="mt-4 max-w-4xl bg-surface px-4">
          <OperationalRow
            icon={<Package aria-hidden="true" className="h-5 w-5 text-success" />}
            title="SO-10471 · Maui Framing"
            description="Partial pickup · 3 items ready"
            detail="10:30"
          />
          <OperationalRow
            icon={<AlertTriangle aria-hidden="true" className="h-5 w-5 text-warning" />}
            title="INV-20841 · Kealoha Builders"
            description="Payment balance requires review"
            detail="$2,840 due"
            tone="warning"
          />
        </div>
      </section>

      <section className="border-b border-divider py-7" aria-labelledby="table-title">
        <h2 id="table-title" className="sc-section-title">Table</h2>
        <div className="mt-4 overflow-hidden rounded-sc border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-semibold">SO-10482</TableCell>
                <TableCell>Kealoha Builders</TableCell>
                <TableCell><StatusLabel tone="warning">Follow-up</StatusLabel></TableCell>
                <TableCell className="text-right tabular-nums">$2,840.00</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold">SO-10471</TableCell>
                <TableCell>Maui Framing</TableCell>
                <TableCell><StatusLabel tone="success">Ready</StatusLabel></TableCell>
                <TableCell className="text-right tabular-nums">$0.00</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="border-b border-divider py-7" aria-labelledby="overlays-title">
        <h2 id="overlays-title" className="sc-section-title">Overlays and Feedback</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm change</DialogTitle>
                <DialogDescription>
                  Review the operational impact before continuing.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
                <DialogClose asChild><Button>Confirm</Button></DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">Open sheet</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Order details</SheetTitle>
                <SheetDescription>Progressive detail for the selected order.</SheetDescription>
              </SheetHeader>
              <div className="mt-6 divide-y divide-divider">
                <OperationalRow title="Customer" detail="Kealoha Builders" />
                <OperationalRow title="Fulfillment" detail="Pickup · Kahului" />
                <OperationalRow title="Order total" detail="$1,379.50" />
              </div>
            </SheetContent>
          </Sheet>
          <Button
            variant="secondary"
            onClick={() => toast.success("Payment posted", { description: "Receipt PAY-1084 is ready." })}
          >
            Show toast
          </Button>
        </div>
      </section>

      <section className="py-7" aria-labelledby="states-title">
        <h2 id="states-title" className="sc-section-title">System States</h2>
        <div className="mt-4 grid divide-y divide-divider rounded-sc border border-border bg-surface lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <EmptyState title="No orders found" description="Try another search or status view." />
          <LoadingState title="Loading orders" description="Checking the local workspace." />
        </div>
        <div className="mt-4 grid divide-y divide-divider rounded-sc border border-border bg-surface lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <ErrorState
            title="Could not load orders"
            description="The request did not complete."
            actionLabel="Try again"
            onAction={() => toast("Retry requested")}
          />
          <SuccessState
            title="Sale confirmed"
            description="Order SO-10482 and its invoice context are available."
            actionLabel="Open order"
            onAction={() => toast("Opening order")}
          />
        </div>
      </section>

      <footer className="flex items-center justify-between border-t border-divider py-5 text-xs text-foreground-secondary">
        <span>Development only</span>
        <span className="inline-flex items-center gap-1">Figma Page 180 <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></span>
      </footer>
    </div>
  );
}
