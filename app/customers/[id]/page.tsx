"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// US phone format: (XXX) XXX-XXXX — store clean digits, display formatted
function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
function parsePhone(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

const CITIES = ["Honolulu", "Kapolei", "Pearl City", "Kaneohe", "Hilo", "Kahului"];
const STATES = ["Hawaii"];
const CITY_TO_ZIP: Record<string, string> = {
  Honolulu: "96813",
  Kapolei: "96707",
  "Pearl City": "96782",
  Kaneohe: "96744",
  Hilo: "96720",
  Kahului: "96732",
};

type CustomerProfile = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  installAddress: string | null;
  billingAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  companyName: string | null;
  customerType: "RESIDENTIAL" | "COMMERCIAL" | "CONTRACTOR" | null;
  taxExempt: boolean;
  taxRate: number | null;
  referredBy: string | null;
  notes: string | null;
  createdAt: string;
};

type SummaryPayload = {
  totalOrders: number;
  openOrders: number;
  unpaidBalance: number;
  lastOrderDate: string | null;
  pendingDeliveryCount: number;
  specialOrderCount: number;
  unpaidCount: number;
};

type CustomerOrderRow = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  total: number;
  paidTotal: number;
  balance: number;
  deliveryRequired: boolean;
  deliveryDate: string | null;
  deliveryStatus: string | null;
  isSpecialOrder: boolean;
};

type CustomerNote = {
  id: string;
  note: string;
  createdBy: string | null;
  createdAt: string;
};

type CustomerReturnRow = {
  id: string;
  createdAt: string;
  status: string;
  creditAmount: number;
  issueStoreCredit: boolean;
  storeCreditId: string | null;
  storeCreditStatus: string | null;
};

type CustomerStoreCreditRow = {
  id: string;
  createdAt: string;
  amount: number;
  status: string;
  returnId: string;
};

type CustomerInvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  paidTotal: number;
  balance: number;
  createdAt: string;
  issueDate: string;
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const { role } = useRole();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [orders, setOrders] = useState<CustomerOrderRow[]>([]);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [returns, setReturns] = useState<CustomerReturnRow[]>([]);
  const [openCredits, setOpenCredits] = useState<CustomerStoreCreditRow[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoiceRow[]>([]);
  const [openCreditBalance, setOpenCreditBalance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ORDERS" | "NOTES">("ORDERS");
  const [orderFilter, setOrderFilter] = useState<
    "ALL" | "OPEN" | "UNPAID" | "PENDING_DELIVERY" | "SPECIAL_ORDER"
  >("ALL");
  const [openNoteModal, setOpenNoteModal] = useState(false);
  const [openEditModal, setOpenEditModal] = useState(false);
  const [submittingNote, setSubmittingNote] = useState(false);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [defaultTaxRate, setDefaultTaxRate] = useState("0");
  const [newNote, setNewNote] = useState("");
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    email: "",
    installAddress: "",
    billingAddress: "",
    city: "",
    state: "",
    zipCode: "",
    companyName: "",
    customerType: "RESIDENTIAL" as "RESIDENTIAL" | "COMMERCIAL" | "CONTRACTOR",
    taxExempt: false,
    taxRate: "0",
    referredBy: "",
    notes: "",
  });

  const loadProfileAndSummary = async () => {
    if (!id) return;
    try {
      const [profileRes, summaryRes] = await Promise.all([
        fetch(`/api/customers/${id}`, { cache: "no-store", headers: { "x-user-role": role } }),
        fetch(`/api/customers/${id}/summary`, { cache: "no-store", headers: { "x-user-role": role } }),
      ]);
      const [profilePayload, summaryPayload] = await Promise.all([profileRes.json(), summaryRes.json()]);
      if (!profileRes.ok) throw new Error(profilePayload.error ?? "Failed to load customer profile");
      if (!summaryRes.ok) throw new Error(summaryPayload.error ?? "Failed to load customer summary");
      setProfile(profilePayload.data ?? null);
      setSummary(summaryPayload.data ?? null);
      setEditForm({
        name: profilePayload.data?.name ?? "",
        phone: parsePhone(profilePayload.data?.phone ?? ""),
        email: profilePayload.data?.email ?? "",
        installAddress: profilePayload.data?.installAddress ?? "",
        billingAddress: profilePayload.data?.billingAddress ?? "",
        city: profilePayload.data?.city ?? "",
        state: profilePayload.data?.state ?? "",
        zipCode: profilePayload.data?.zipCode ?? "",
        companyName: profilePayload.data?.companyName ?? "",
        customerType: profilePayload.data?.customerType ?? "RESIDENTIAL",
        taxExempt: Boolean(profilePayload.data?.taxExempt ?? false),
        taxRate:
          profilePayload.data?.taxRate === null || profilePayload.data?.taxRate === undefined
            ? ""
            : String(profilePayload.data.taxRate),
        referredBy: profilePayload.data?.referredBy ?? "",
        notes: profilePayload.data?.notes ?? "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer details");
    }
  };

  const loadOrders = async (filter = orderFilter) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/customers/${id}/orders?filter=${filter}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load customer orders");
      setOrders(payload.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer orders");
    }
  };

  const loadNotes = async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/customers/${id}/notes`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load notes");
      setNotes(payload.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notes");
    }
  };

  const loadReturnsAndCredits = async () => {
    if (!id) return;
    try {
      const [returnsRes, creditsRes] = await Promise.all([
        fetch(`/api/customers/${id}/returns`, {
          cache: "no-store",
          headers: { "x-user-role": role },
        }),
        fetch(`/api/customers/${id}/store-credits`, {
          cache: "no-store",
          headers: { "x-user-role": role },
        }),
      ]);
      const [returnsPayload, creditsPayload] = await Promise.all([returnsRes.json(), creditsRes.json()]);
      if (!returnsRes.ok) throw new Error(returnsPayload.error ?? "Failed to load customer returns");
      if (!creditsRes.ok) throw new Error(creditsPayload.error ?? "Failed to load customer store credits");
      setReturns(returnsPayload.data ?? []);
      setOpenCredits(creditsPayload.data?.credits ?? []);
      setOpenCreditBalance(Number(creditsPayload.data?.totalOpenCredit ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load return and store credit data");
    }
  };

  const loadInvoices = async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/customers/${id}/invoices`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load customer invoices");
      setInvoices(payload.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer invoices");
    }
  };

  useEffect(() => {
    const loadDefaultTaxRate = async () => {
      try {
        const res = await fetch("/api/settings/company", {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to load default tax rate");
        setDefaultTaxRate(String(Number(payload.data?.defaultTaxRate ?? 0)));
      } catch {
        // Keep edit modal usable with existing values.
      }
    };
    void loadDefaultTaxRate();
  }, [role]);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        await Promise.all([loadProfileAndSummary(), loadOrders("ALL"), loadNotes(), loadReturnsAndCredits(), loadInvoices()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load customer details");
      }
    };
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, role]);

  useEffect(() => {
    loadOrders(orderFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderFilter]);

  const submitNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittingNote(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ note: newNote }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to add note");
      setNewNote("");
      setOpenNoteModal(false);
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setSubmittingNote(false);
    }
  };

  const submitEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittingEdit(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify(editForm),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to update customer");
      setOpenEditModal(false);
      await loadProfileAndSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update customer");
    } finally {
      setSubmittingEdit(false);
    }
  };

  const setReminderFilter = (
    filter: "PENDING_DELIVERY" | "SPECIAL_ORDER" | "UNPAID",
  ) => {
    setOrderFilter(filter);
    setActiveTab("ORDERS");
  };

  return (
    <section className="mx-auto max-w-[1400px] space-y-10 px-4 py-8 text-white">
      {/* 1) Customer profile summary — structured */}
      <header className="glass-card overflow-hidden">
        <div className="glass-card-content p-6 md:p-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_auto] md:gap-10">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
                {profile?.name || "Customer"}
              </h1>
              {profile?.companyName ? (
                <p className="mt-1 text-sm text-slate-400">{profile.companyName}</p>
              ) : null}
              <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Type</span>
                  <span className="text-white/95">{profile?.customerType ?? "—"}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Phone</span>
                  <span className="text-white/95">{profile?.phone || "—"}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Email</span>
                  <span className="text-white/95">{profile?.email || "—"}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Billing</span>
                  <span className="text-white/95">{profile?.billingAddress || "—"}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Referred by</span>
                  <span className="text-white/95">{profile?.referredBy || "—"}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tax rate</span>
                  <span className="text-white/95">
                    {profile?.taxExempt ? "Exempt" : `${Number(profile?.taxRate ?? 0).toFixed(2)}%`}
                  </span>
                </div>
              </div>
              {(profile?.installAddress || (profile?.city && profile?.state)) ? (
                <p className="mt-4 border-t border-white/10 pt-4 text-xs text-slate-500">
                  Install: {profile?.installAddress || [profile?.city, profile?.state, profile?.zipCode].filter(Boolean).join(", ") || "—"}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col justify-center gap-3 border-t border-white/10 pt-6 md:border-t-0 md:border-l md:pl-8 md:pt-0">
              <Link
                href={`/sales-orders/new?customerId=${id}`}
                className="rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-white/15"
              >
                New Order
              </Link>
              <button
                type="button"
                onClick={() => setOpenEditModal(true)}
                className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Edit Customer
              </button>
              <button
                type="button"
                onClick={() => setOpenNoteModal(true)}
                className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Add Note
              </button>
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {/* 2) KPI row — prominent metric cards */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <div className="glass-card overflow-hidden">
          <div className="h-0.5 w-full bg-white/10" aria-hidden />
          <div className="glass-card-content p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Orders</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-white">{summary?.totalOrders ?? 0}</p>
          </div>
        </div>
        <div className="glass-card overflow-hidden">
          <div className="h-0.5 w-full bg-white/10" aria-hidden />
          <div className="glass-card-content p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Open Orders</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-white">{summary?.openOrders ?? 0}</p>
          </div>
        </div>
        <div className="glass-card overflow-hidden">
          <div className="h-0.5 w-full bg-white/10" aria-hidden />
          <div className="glass-card-content p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Unpaid Balance</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-white">${Number(summary?.unpaidBalance ?? 0).toFixed(2)}</p>
          </div>
        </div>
        <div className="glass-card overflow-hidden">
          <div className="h-0.5 w-full bg-white/10" aria-hidden />
          <div className="glass-card-content p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Last Order</p>
            <p className="mt-2 text-xl font-bold text-white">
              {summary?.lastOrderDate
                ? new Date(summary.lastOrderDate).toLocaleDateString("en-US", { timeZone: "UTC" })
                : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* 3) Main 2-column workspace: left ~74%, right ~26% */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,74fr)_minmax(0,26fr)]">
        <div className="space-y-8">
          {/* Orders / Notes tab section */}
          <div className="glass-card overflow-hidden p-0">
            <div className="glass-card-content">
              <div className="border-b border-white/10 px-5 py-4">
                <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("ORDERS")}
                    className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                      activeTab === "ORDERS"
                        ? "bg-white/10 text-white"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-300"
                    }`}
                  >
                    Orders
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("NOTES")}
                    className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                      activeTab === "NOTES"
                        ? "bg-white/10 text-white"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-300"
                    }`}
                  >
                    Notes / Activity
                  </button>
                </div>

                {activeTab === "ORDERS" ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {(
                      [
                        ["ALL", "All"],
                        ["OPEN", "Open"],
                        ["UNPAID", "Unpaid"],
                        ["PENDING_DELIVERY", "Pending Delivery"],
                        ["SPECIAL_ORDER", "Special Order"],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setOrderFilter(key)}
                        className={`rounded-xl border px-3.5 py-2 text-xs font-medium transition ${
                          orderFilter === key
                            ? "border-white/20 bg-white/10 text-white"
                            : "border-white/10 text-slate-400 hover:bg-white/5 hover:text-slate-300"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {activeTab === "ORDERS" ? (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 bg-white/[0.08] hover:bg-white/[0.08]">
                        <TableHead className="px-5 py-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Order #</TableHead>
                        <TableHead className="px-5 py-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Created</TableHead>
                        <TableHead className="px-5 py-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Status</TableHead>
                        <TableHead className="px-5 py-4 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total</TableHead>
                        <TableHead className="px-5 py-4 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Paid</TableHead>
                        <TableHead className="px-5 py-4 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Balance</TableHead>
                        <TableHead className="px-5 py-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Delivery Date</TableHead>
                        <TableHead className="px-5 py-4 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="py-16 text-center">
                            <p className="text-base font-medium text-white/90">No orders for this filter.</p>
                            <p className="mt-2 text-sm text-slate-500">Change the filter or create a new order.</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        orders.map((order) => (
                          <TableRow key={order.id} className="border-white/10 transition-colors hover:bg-white/[0.06]">
                            <TableCell className="px-5 py-4">
                              <Link
                                href={`/sales-orders/${order.id}`}
                                className="font-semibold text-white hover:underline"
                              >
                                {order.orderNumber}
                              </Link>
                            </TableCell>
                            <TableCell className="px-5 py-4 text-sm text-slate-300">
                              {new Date(order.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}
                            </TableCell>
                            <TableCell className="px-5 py-4 text-sm text-slate-300">{order.status}</TableCell>
                            <TableCell className="px-5 py-4 text-right text-sm tabular-nums text-slate-300">${order.total.toFixed(2)}</TableCell>
                            <TableCell className="px-5 py-4 text-right text-sm tabular-nums text-slate-300">${order.paidTotal.toFixed(2)}</TableCell>
                            <TableCell className="px-5 py-4 text-right text-sm font-medium tabular-nums text-rose-300">
                              ${order.balance.toFixed(2)}
                            </TableCell>
                            <TableCell className="px-5 py-4 text-sm text-slate-300">
                              {order.deliveryDate
                                ? new Date(order.deliveryDate).toLocaleDateString("en-US", { timeZone: "UTC" })
                                : "—"}
                            </TableCell>
                            <TableCell className="px-5 py-4 text-right">
                              <div className="inline-flex items-center gap-2">
                                <Link href={`/sales-orders/${order.id}`} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs font-medium text-white/90 hover:bg-white/10">
                                  View
                                </Link>
                                <Link href={`/orders/${order.id}/print`} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs font-medium text-white/90 hover:bg-white/10">
                                  Print
                                </Link>
                                <a
                                  href={`/api/pdf/sales-order/${order.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs font-medium text-white/90 hover:bg-white/10"
                                >
                                  PDF
                                </a>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="space-y-3 p-4">
                  {notes.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-sm font-medium text-white/80">No activity notes yet.</p>
                      <p className="mt-1 text-xs text-slate-500">Add a note to track customer activity.</p>
                    </div>
                  ) : (
                    notes.map((note) => (
                      <div key={note.id} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                        <p className="text-xs text-slate-500">
                          {new Date(note.createdAt).toLocaleString("en-US", { timeZone: "UTC" })}
                          {note.createdBy ? ` · ${note.createdBy}` : ""}
                        </p>
                        <p className="mt-1 text-sm text-white/90">{note.note}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="glass-card p-0 overflow-hidden">
            <div className="glass-card-content px-5 pt-5 pb-1">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Invoices</h3>
              <Link href="/invoices" className="text-xs text-slate-400 hover:text-white hover:underline">
                View all
              </Link>
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 bg-white/[0.08] hover:bg-white/[0.08]">
                    <TableHead className="px-5 py-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Date</TableHead>
                    <TableHead className="px-5 py-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Invoice #</TableHead>
                    <TableHead className="px-5 py-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Status</TableHead>
                    <TableHead className="px-5 py-4 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total</TableHead>
                    <TableHead className="px-5 py-4 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Paid</TableHead>
                    <TableHead className="px-5 py-4 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Balance</TableHead>
                    <TableHead className="px-5 py-4 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-14 text-center">
                        <p className="text-base font-medium text-white/90">No invoices yet.</p>
                        <p className="mt-2 text-sm text-slate-500">Invoices will appear here when created from orders.</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoices.map((row) => (
                      <TableRow
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => router.push(`/invoices/${row.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            router.push(`/invoices/${row.id}`);
                          }
                        }}
                        className="cursor-pointer border-white/10 transition-colors hover:bg-white/[0.06]"
                      >
                        <TableCell className="px-5 py-4 text-sm text-slate-300">
                          {new Date(row.issueDate || row.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}
                        </TableCell>
                        <TableCell className="px-5 py-4 font-medium text-white">{row.invoiceNumber}</TableCell>
                        <TableCell className="px-5 py-4 text-sm text-slate-300">{row.status}</TableCell>
                        <TableCell className="px-5 py-4 text-right text-sm tabular-nums text-slate-300">${Number(row.total).toFixed(2)}</TableCell>
                        <TableCell className="px-5 py-4 text-right text-sm tabular-nums text-slate-300">${Number(row.paidTotal).toFixed(2)}</TableCell>
                        <TableCell className="px-5 py-4 text-right text-sm tabular-nums text-slate-300">${Number(row.balance).toFixed(2)}</TableCell>
                        <TableCell className="px-5 py-4 text-right">
                          <Link
                            href={`/invoices/${row.id}`}
                            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs font-medium text-white/90 hover:bg-white/10"
                            onClick={(event) => event.stopPropagation()}
                          >
                            View
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            </div>
          </div>

          <div className="glass-card p-0 overflow-hidden">
            <div className="glass-card-content px-5 pt-5 pb-1">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Returns</h3>
              <span className="text-xs text-slate-500">Last 10</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 bg-white/[0.08] hover:bg-white/[0.08]">
                    <TableHead className="px-5 py-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Return #</TableHead>
                    <TableHead className="px-5 py-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Date</TableHead>
                    <TableHead className="px-5 py-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Status</TableHead>
                    <TableHead className="px-5 py-4 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Credit Amount</TableHead>
                    <TableHead className="px-5 py-4 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-14 text-center">
                        <p className="text-base font-medium text-white/90">No returns yet.</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    returns.map((row) => (
                      <TableRow key={row.id} className="border-white/10 transition-colors hover:bg-white/[0.06]">
                        <TableCell className="px-5 py-4 font-medium text-white">{row.id.slice(0, 8)}</TableCell>
                        <TableCell className="px-5 py-4 text-sm text-slate-300">
                          {new Date(row.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-sm text-slate-300">{row.status}</TableCell>
                        <TableCell className="px-5 py-4 text-right text-sm tabular-nums text-slate-300">${Number(row.creditAmount).toFixed(2)}</TableCell>
                        <TableCell className="px-5 py-4 text-right">
                          <Link href={`/returns/${row.id}`} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs font-medium text-white/90 hover:bg-white/10">
                            Open
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            </div>
          </div>

          <div className="glass-card p-0 overflow-hidden">
            <div className="glass-card-content px-5 pt-5 pb-1">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-white">Store Credit</h3>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                Open Balance: ${openCreditBalance.toFixed(2)}
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 bg-white/[0.08] hover:bg-white/[0.08]">
                    <TableHead className="px-5 py-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Credit #</TableHead>
                    <TableHead className="px-5 py-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Date</TableHead>
                    <TableHead className="px-5 py-4 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Amount</TableHead>
                    <TableHead className="px-5 py-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Status</TableHead>
                    <TableHead className="px-5 py-4 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Source Return</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openCredits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-14 text-center">
                        <p className="text-base font-medium text-white/90">No open store credits.</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    openCredits.map((row) => (
                      <TableRow key={row.id} className="border-white/10 transition-colors hover:bg-white/[0.06]">
                        <TableCell className="px-5 py-4 font-medium text-white">{row.id.slice(0, 8)}</TableCell>
                        <TableCell className="px-5 py-4 text-sm text-slate-300">
                          {new Date(row.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-right text-sm tabular-nums text-slate-300">${Number(row.amount).toFixed(2)}</TableCell>
                        <TableCell className="px-5 py-4 text-sm text-slate-300">{row.status}</TableCell>
                        <TableCell className="px-5 py-4 text-right">
                          <Link href={`/returns/${row.returnId}`} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs font-medium text-white/90 hover:bg-white/10">
                            Open Return
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="glass-card overflow-hidden">
            <div className="glass-card-content p-5">
              <h3 className="text-base font-semibold text-white">Quick Reminders</h3>
              <p className="mt-1 text-xs text-slate-500">Tap to filter orders</p>
              <div className="mt-5 space-y-4">
                <button
                  type="button"
                  onClick={() => setReminderFilter("PENDING_DELIVERY")}
                  className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-5 py-4 text-left transition hover:bg-white/[0.08]"
                >
                  <span className="text-base font-medium text-white/95">Pending Delivery</span>
                  <span className="text-xl font-bold tabular-nums text-white">{summary?.pendingDeliveryCount ?? 0}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReminderFilter("SPECIAL_ORDER")}
                  className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-5 py-4 text-left transition hover:bg-white/[0.08]"
                >
                  <span className="text-base font-medium text-white/95">Special Orders</span>
                  <span className="text-xl font-bold tabular-nums text-white">{summary?.specialOrderCount ?? 0}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReminderFilter("UNPAID")}
                  className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-5 py-4 text-left transition hover:bg-white/[0.08]"
                >
                  <span className="text-base font-medium text-white/95">Unpaid</span>
                  <span className="text-xl font-bold tabular-nums text-white">{summary?.unpaidCount ?? 0}</span>
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {openNoteModal ? (
        <Modal title="Add Note" onClose={() => setOpenNoteModal(false)}>
          <form className="space-y-3" onSubmit={submitNote}>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Note</span>
              <textarea
                value={newNote}
                onChange={(event) => setNewNote(event.target.value)}
                rows={4}
                required
                className="w-full rounded-xl border border-slate-100 p-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpenNoteModal(false)} className="ios-secondary-btn h-10 flex-1">
                Cancel
              </button>
              <button type="submit" disabled={submittingNote} className="ios-primary-btn h-10 flex-1 disabled:opacity-60">
                {submittingNote ? "Saving..." : "Save Note"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {openEditModal ? (
        <Modal title="Edit Customer" onClose={() => setOpenEditModal(false)} maxWidth="max-w-2xl" variant="dark">
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submitEdit}>
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
              <InputField variant="dark" label="Name" value={editForm.name} onChange={(value) => setEditForm((prev) => ({ ...prev, name: value }))} required placeholder="Name" />
              <PhoneInput
                variant="dark"
                label="Phone"
                value={editForm.phone}
                onChange={(value) => setEditForm((prev) => ({ ...prev, phone: value }))}
                placeholder="(808) 555-1234"
              />
              <InputField variant="dark" label="Email" value={editForm.email} onChange={(value) => setEditForm((prev) => ({ ...prev, email: value }))} placeholder="customer@email.com" />
              <InputField
                variant="dark"
                label="Install Address"
                value={editForm.installAddress}
                onChange={(value) => setEditForm((prev) => ({ ...prev, installAddress: value }))}
                placeholder="Street address"
              />
              <InputField
                variant="dark"
                label="Billing Address"
                value={editForm.billingAddress}
                onChange={(value) => setEditForm((prev) => ({ ...prev, billingAddress: value }))}
                placeholder="Billing address"
              />
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <SearchableSelect
                  variant="dark"
                  label="City"
                  options={CITIES}
                  value={editForm.city}
                  onChange={(value) => {
                    setEditForm((prev) => ({
                      ...prev,
                      city: value,
                      zipCode: prev.zipCode || CITY_TO_ZIP[value] || prev.zipCode,
                    }));
                  }}
                  placeholder="Select city"
                />
                <SearchableSelect
                  variant="dark"
                  label="State"
                  options={STATES}
                  value={editForm.state}
                  onChange={(value) => setEditForm((prev) => ({ ...prev, state: value }))}
                  placeholder="Select state"
                />
                <ZipInput
                  variant="dark"
                  label="Zip Code"
                  value={editForm.zipCode}
                  onChange={(value) => setEditForm((prev) => ({ ...prev, zipCode: value }))}
                  placeholder="96813"
                />
              </div>
              <InputField
                variant="dark"
                label="Company Name"
                value={editForm.companyName}
                onChange={(value) => setEditForm((prev) => ({ ...prev, companyName: value }))}
              />
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-gray-300">Customer Type</span>
                <select
                  value={editForm.customerType}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      customerType: event.target.value as "RESIDENTIAL" | "COMMERCIAL" | "CONTRACTOR",
                    }))
                  }
                  className="h-11 w-full rounded-lg border border-white/10 bg-[#111827] px-3 text-sm text-white outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="RESIDENTIAL">Residential</option>
                  <option value="COMMERCIAL">Commercial</option>
                  <option value="CONTRACTOR">Contractor</option>
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#111827] px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={editForm.taxExempt}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      taxExempt: event.target.checked,
                      taxRate: event.target.checked ? "" : prev.taxRate || defaultTaxRate,
                    }))
                  }
                  className="h-4 w-4 rounded border-white/10 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm font-medium text-gray-300">Tax Exempt</span>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-gray-300">Tax Rate</span>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={editForm.taxRate}
                    disabled={editForm.taxExempt}
                    onChange={(event) =>
                      setEditForm((prev) => ({ ...prev, taxRate: event.target.value }))
                    }
                    className="h-11 w-full rounded-lg border border-white/10 bg-[#111827] px-3 pr-8 text-sm text-white outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 disabled:bg-white/5 disabled:text-gray-400"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                    %
                  </span>
                </div>
              </label>
              <InputField
                variant="dark"
                label="Referred By"
                value={editForm.referredBy}
                onChange={(value) => setEditForm((prev) => ({ ...prev, referredBy: value }))}
              />
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-gray-300">Notes</span>
                <textarea
                  value={editForm.notes}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))}
                  rows={3}
                  placeholder="Optional notes..."
                  className="w-full rounded-lg border border-white/10 bg-[#111827] p-3 text-sm text-white placeholder:text-gray-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                />
              </label>
            </div>
            <div className="mt-6 flex shrink-0 items-center justify-between gap-3 border-t border-white/10 pt-6">
              <button
                type="button"
                onClick={() => setOpenEditModal(false)}
                className="rounded-lg border border-white/10 bg-transparent px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/5"
              >
                Back
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpenEditModal(false)} className="rounded-lg border border-white/10 bg-transparent px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/5">
                  Cancel
                </button>
                <button type="submit" disabled={submittingEdit} className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">
                  {submittingEdit ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}

function Modal({
  title,
  children,
  onClose,
  maxWidth = "max-w-lg",
  variant = "light",
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
  variant?: "light" | "dark";
}) {
  const isDark = variant === "dark";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]">
      <div
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl ${maxWidth} ${
          isDark
            ? "border border-white/10 bg-[#1f2937] text-white shadow-2xl"
            : "border border-slate-200/80 bg-white shadow-xl"
        }`}
      >
        <div
          className={`flex shrink-0 items-center justify-between px-6 py-4 ${
            isDark ? "border-b border-white/10" : "border-b border-slate-200"
          }`}
        >
          <h3 className={`text-base font-semibold tracking-tight ${isDark ? "text-white" : "text-gray-900"}`}>
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={
              isDark
                ? "h-10 rounded-lg px-3 text-sm text-gray-300 hover:bg-white/5"
                : "h-10 rounded-lg px-3 text-sm text-gray-600 hover:bg-gray-100"
            }
          >
            Close
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  required,
  placeholder,
  variant = "light",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  variant?: "light" | "dark";
}) {
  const isDark = variant === "dark";
  return (
    <label className="block space-y-1.5">
      <span className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        className={
          isDark
            ? "h-11 w-full rounded-lg border border-white/10 bg-[#111827] px-3 text-sm text-white placeholder:text-gray-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
            : "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
        }
      />
    </label>
  );
}

function PhoneInput({
  label,
  value,
  onChange,
  placeholder,
  variant = "light",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: "light" | "dark";
}) {
  const isDark = variant === "dark";
  const display = formatPhone(value);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = parsePhone(e.target.value);
    onChange(next);
  };
  return (
    <label className="block space-y-1.5">
      <span className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>{label}</span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        className={
          isDark
            ? "h-11 w-full rounded-lg border border-white/10 bg-[#111827] px-3 text-sm text-white placeholder:text-gray-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
            : "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
        }
      />
    </label>
  );
}

function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
  variant = "light",
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: "light" | "dark";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isDark = variant === "dark";
  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;
  const showDropdown = open && filtered.length > 0;

  useEffect(() => {
    if (!open) return;
    setHighlightIndex(0);
  }, [open, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const select = (option: string) => {
    onChange(option);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleFocus = () => {
    setOpen(true);
    setQuery(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) {
      if (e.key === "ArrowDown" || e.key === "Enter") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % filtered.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i - 1 + filtered.length) % filtered.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      select(filtered[highlightIndex]);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className="relative block space-y-1.5">
      <span className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>{label}</span>
      <input
        ref={inputRef}
        type="text"
        value={open ? query : value}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!value && !e.target.value) setOpen(false);
        }}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={
          isDark
            ? "h-11 w-full rounded-lg border border-white/10 bg-[#111827] px-3 text-sm text-white placeholder:text-gray-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
            : "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
        }
      />
      {showDropdown ? (
        <ul
          className={`absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg py-1 shadow-lg ${
            isDark ? "border border-white/10 bg-[#111827]" : "border border-gray-200 bg-white"
          }`}
          role="listbox"
        >
          {filtered.map((option, i) => (
            <li
              key={option}
              role="option"
              aria-selected={i === highlightIndex}
              onClick={() => select(option)}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`cursor-pointer px-3 py-2.5 text-sm ${
                isDark
                  ? i === highlightIndex
                    ? "bg-white/10 text-white"
                    : "text-gray-300"
                  : i === highlightIndex
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-700"
              }`}
            >
              {option}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ZipInput({
  label,
  value,
  onChange,
  placeholder,
  variant = "light",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: "light" | "dark";
}) {
  const isDark = variant === "dark";
  const digitsOnly = value.replace(/\D/g, "").slice(0, 5);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value.replace(/\D/g, "").slice(0, 5);
    onChange(next);
  };
  return (
    <label className="block space-y-1.5">
      <span className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="postal-code"
        value={digitsOnly}
        onChange={handleChange}
        placeholder={placeholder}
        maxLength={5}
        className={
          isDark
            ? "h-11 w-full rounded-lg border border-white/10 bg-[#111827] px-3 text-sm text-white placeholder:text-gray-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
            : "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
        }
      />
    </label>
  );
}
