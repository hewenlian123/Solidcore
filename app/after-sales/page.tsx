"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Ticket = {
  id: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "PENDING" | "IN_PROGRESS" | "RESOLVED" | "FOLLOW_UP";
  assignedTechnician: string | null;
  createdAt: string;
  customer: { name: string };
  order: { orderNo: string };
  maintenanceRecords: Array<{ id: string; notes: string; cost: string; createdAt: string }>;
};

const COLUMNS: Array<{ key: Ticket["status"]; label: string }> = [
  { key: "PENDING", label: "Pending" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "FOLLOW_UP", label: "Customer Follow-up" },
];

const PRIORITY_CLASS = {
  LOW: "bg-slate-100 text-slate-700",
  MEDIUM: "bg-amber-100 text-amber-800",
  HIGH: "bg-rose-100 text-rose-800",
};

export default function AfterSalesPage() {
  const { role } = useRole();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [orders, setOrders] = useState<Array<{ id: string; orderNo: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    orderId: "",
    description: "",
    priority: "MEDIUM",
    appointmentAt: "",
    assignedTechnician: "",
  });
  const [maintenanceForm, setMaintenanceForm] = useState<{ [ticketId: string]: { notes: string; cost: string } }>({});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = async () => {
    try {
      const [ticketRes, orderRes] = await Promise.all([
        fetch("/api/after-sales", { cache: "no-store", headers: { "x-user-role": role } }),
        fetch("/api/orders", { cache: "no-store", headers: { "x-user-role": role } }),
      ]);
      const ticketPayload = await ticketRes.json();
      const orderPayload = await orderRes.json();
      if (!ticketRes.ok) throw new Error(ticketPayload.error ?? "Failed to load after-sales tickets");
      if (!orderRes.ok) throw new Error(orderPayload.error ?? "Failed to load orders");
      setTickets(ticketPayload.data ?? []);
      setOrders((orderPayload.data ?? []).map((o: any) => ({ id: o.id, orderNo: o.orderNo })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  };

  useEffect(() => {
    load();
  }, [role]);

  const grouped = useMemo(() => {
    return COLUMNS.map((col) => ({
      ...col,
      items: tickets.filter((item) => item.status === col.key),
    }));
  }, [tickets]);

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const current = tickets.find((t) => t.id === activeId);
    const target = tickets.find((t) => t.id === overId);
    if (!current || !target || current.status === target.status) return;

    const flow = ["PENDING", "IN_PROGRESS", "RESOLVED", "FOLLOW_UP"];
    const fromIdx = flow.indexOf(current.status);
    const toIdx = flow.indexOf(target.status);
    if (toIdx !== fromIdx + 1) {
      setError("Status can only be dragged in workflow order.");
      return;
    }

    try {
      const res = await fetch(`/api/after-sales/${activeId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ status: target.status }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update status");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const createTicket = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const res = await fetch("/api/after-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify(form),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to create ticket");
      setOpen(false);
      setForm({ orderId: "", description: "", priority: "MEDIUM", appointmentAt: "", assignedTechnician: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    }
  };

  const addMaintenance = async (ticketId: string) => {
    const draft = maintenanceForm[ticketId];
    if (!draft?.notes) return;
    try {
      const res = await fetch(`/api/after-sales/${ticketId}/maintenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ notes: draft.notes, cost: Number(draft.cost || 0) }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to save maintenance record");
      setMaintenanceForm((prev) => ({ ...prev, [ticketId]: { notes: "", cost: "" } }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save maintenance record");
    }
  };

  const records = tickets.flatMap((ticket) =>
    ticket.maintenanceRecords.map((record) => ({
      ...record,
      customerName: ticket.customer.name,
      orderNo: ticket.order.orderNo,
      technician: ticket.assignedTechnician || "-",
    })),
  );

  return (
    <section className="space-y-8">
      <div className="linear-card p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">After-Sales Ticket Board</h1>
            <p className="mt-2 text-sm text-slate-500">Use priority and ticket status to close after-sales issues faster.</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ios-primary-btn inline-flex h-12 items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Ticket
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
          {grouped.map((column) => (
            <div key={column.key} className="linear-card p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">{column.label}</h2>
              <SortableContext items={column.items.map((item) => item.id)} strategy={rectSortingStrategy}>
                <div className="space-y-2">
                  {column.items.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} />
                  ))}
                </div>
              </SortableContext>
            </div>
          ))}
        </div>
      </DndContext>

      <div className="linear-card p-8">
        <h2 className="text-base font-semibold text-slate-900">Maintenance History</h2>
        <div className="mt-3 overflow-hidden rounded-xl bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                <TableHead>Customer</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Technician</TableHead>
                <TableHead>Maintenance Notes</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500">
                    No maintenance history
                  </TableCell>
                </TableRow>
              ) : (
                records.map((row) => (
                  <TableRow key={row.id} className="odd:bg-white even:bg-slate-50/40">
                    <TableCell>{row.customerName}</TableCell>
                    <TableCell>{row.orderNo}</TableCell>
                    <TableCell>{row.technician}</TableCell>
                    <TableCell>{row.notes}</TableCell>
                    <TableCell className="font-semibold text-slate-900">${Number(row.cost).toFixed(2)}</TableCell>
                    <TableCell>{new Date(row.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {tickets.map((ticket) => (
          <div key={ticket.id} className="linear-card p-6">
            <p className="text-sm font-semibold text-slate-900">
              {ticket.order.orderNo} · {ticket.customer.name}
            </p>
            <p className="mt-1 text-xs text-slate-500">Add maintenance notes</p>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px_90px]">
              <input
                value={maintenanceForm[ticket.id]?.notes ?? ""}
                onChange={(e) =>
                  setMaintenanceForm((prev) => ({
                    ...prev,
                    [ticket.id]: { ...(prev[ticket.id] ?? { notes: "", cost: "" }), notes: e.target.value },
                  }))
                }
                className="ios-input h-11 px-3 text-sm"
                placeholder="e.g. Replaced hinge and realigned"
              />
              <input
                value={maintenanceForm[ticket.id]?.cost ?? ""}
                onChange={(e) =>
                  setMaintenanceForm((prev) => ({
                    ...prev,
                    [ticket.id]: { ...(prev[ticket.id] ?? { notes: "", cost: "" }), cost: e.target.value },
                  }))
                }
                className="ios-input h-11 px-3 text-sm"
                placeholder="Cost"
              />
              <button
                type="button"
                onClick={() => addMaintenance(ticket.id)}
                className="ios-primary-btn h-11 px-3 text-sm"
              >
                Save
              </button>
            </div>
          </div>
        ))}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]">
          <div className="linear-card w-full max-w-lg p-8">
            <h3 className="text-base font-semibold text-slate-900">CreateAfter-Sales Tickets</h3>
            <form className="mt-4 space-y-3" onSubmit={createTicket}>
              <label className="block space-y-1">
                <span className="text-sm text-slate-600">Related Order</span>
                <select
                  value={form.orderId}
                  onChange={(e) => setForm((p) => ({ ...p, orderId: e.target.value }))}
                  className="ios-input h-12 w-full px-3 text-sm"
                  required
                >
                  <option value="">Select an order</option>
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.orderNo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-slate-600">Issue Description</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full rounded-xl border border-slate-100 p-3 text-sm outline-none transition focus:ring-2 focus:ring-slate-200"
                  required
                />
              </label>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm text-slate-600">Priority</span>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                    className="ios-input h-12 w-full px-3 text-sm"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-sm text-slate-600">Appointment</span>
                  <input
                    type="datetime-local"
                    value={form.appointmentAt}
                    onChange={(e) => setForm((p) => ({ ...p, appointmentAt: e.target.value }))}
                    className="ios-input h-12 w-full px-3 text-sm"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-sm text-slate-600">Assign Technician</span>
                <input
                  value={form.assignedTechnician}
                  onChange={(e) => setForm((p) => ({ ...p, assignedTechnician: e.target.value }))}
                  className="ios-input h-12 w-full px-3 text-sm"
                />
              </label>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="ios-secondary-btn h-12 flex-1 text-sm">
                  Cancel
                </button>
                <button type="submit" className="ios-primary-btn h-12 flex-1 text-sm">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: ticket.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const [nowTs, setNowTs] = useState<number | null>(null);
  useEffect(() => {
    setNowTs(Date.now());
  }, []);
  const waitingDays =
    nowTs === null
      ? 0
      : Math.max(0, Math.floor((nowTs - new Date(ticket.createdAt).getTime()) / (1000 * 60 * 60 * 24)));
  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab rounded-xl border border-slate-100 bg-slate-50/70 p-3 active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{ticket.customer.name}</p>
        <span className={`rounded-xl px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_CLASS[ticket.priority]}`}>
          {ticket.priority === "HIGH" ? "High" : ticket.priority === "MEDIUM" ? "Medium" : "Low"}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-slate-700">{ticket.description}</p>
      <p className="mt-2 text-[11px] text-slate-500">Waiting {waitingDays} days · Owner: {ticket.assignedTechnician || "Unassigned"}</p>
    </article>
  );
}
