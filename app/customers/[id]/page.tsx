"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
        phone: profilePayload.data?.phone ?? "",
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
    <section className="space-y-4">
      <div className="linear-card flex flex-col gap-3 p-5 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{profile?.name || "Customer"}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {[profile?.phone, profile?.email].filter(Boolean).join(" · ") || "-"}
          </p>
          <p className="mt-1 text-sm text-slate-500">{profile?.installAddress || "-"}</p>
          <p className="mt-1 text-sm text-slate-500">
            {[profile?.city, profile?.state, profile?.zipCode].filter(Boolean).join(", ") || "-"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {profile?.companyName ? `${profile.companyName} · ` : ""}
            {profile?.customerType ? profile.customerType : "Customer Type N/A"}
            {profile?.taxExempt ? " · Tax Exempt" : ""}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Tax Rate: {profile?.taxExempt ? "-" : `${Number(profile?.taxRate ?? 0).toFixed(3)}%`}
          </p>
          <p className="mt-1 text-sm text-slate-500">Billing: {profile?.billingAddress || "-"}</p>
          <p className="mt-1 text-sm text-slate-500">Referred By: {profile?.referredBy || "-"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/sales-orders/new?customerId=${id}`}
            className="ios-primary-btn inline-flex h-9 items-center px-3 text-sm"
          >
            New Order
          </Link>
          <button
            type="button"
            onClick={() => setOpenEditModal(true)}
            className="ios-secondary-btn h-9 px-3 text-sm"
          >
            Edit Customer
          </button>
          <button
            type="button"
            onClick={() => setOpenNoteModal(true)}
            className="ios-secondary-btn h-9 px-3 text-sm"
          >
            Add Note
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Total Orders" value={String(summary?.totalOrders ?? 0)} />
            <KpiCard label="Open Orders" value={String(summary?.openOrders ?? 0)} />
            <KpiCard
              label="Unpaid Balance"
              value={`$${Number(summary?.unpaidBalance ?? 0).toFixed(2)}`}
            />
            <KpiCard
              label="Last Order Date"
              value={
                summary?.lastOrderDate
                  ? new Date(summary.lastOrderDate).toLocaleDateString("en-US", { timeZone: "UTC" })
                  : "-"
              }
            />
          </div>

          <div className="linear-card p-4">
            <div className="mb-3 inline-flex rounded-xl border border-white/10 bg-white/5 p-1 backdrop-blur-xl">
              <button
                type="button"
                onClick={() => setActiveTab("ORDERS")}
                className={`rounded-lg px-3 py-1.5 text-xs ${activeTab === "ORDERS" ? "so-chip-active" : "so-chip"}`}
              >
                Orders
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("NOTES")}
                className={`rounded-lg px-3 py-1.5 text-xs ${activeTab === "NOTES" ? "so-chip-active" : "so-chip"}`}
              >
                Notes / Activity
              </button>
            </div>

            {activeTab === "ORDERS" ? (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
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
                      className={`rounded-xl px-3 py-1.5 text-xs ${
                        orderFilter === key
                          ? "bg-slate-900 text-white"
                          : "so-chip"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 bg-white/5 hover:bg-white/5">
                        <TableHead>Order #</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Delivery Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-slate-500">
                            No orders for this filter.
                          </TableCell>
                        </TableRow>
                      ) : (
                        orders.map((order) => (
                          <TableRow key={order.id} className="border-white/10 transition-colors hover:bg-white/10">
                            <TableCell>
                              <Link
                                href={`/sales-orders/${order.id}`}
                                className="font-semibold text-slate-900 hover:underline"
                              >
                                {order.orderNumber}
                              </Link>
                            </TableCell>
                            <TableCell>
                              {new Date(order.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}
                            </TableCell>
                            <TableCell>{order.status}</TableCell>
                            <TableCell className="text-right">${order.total.toFixed(2)}</TableCell>
                            <TableCell className="text-right">${order.paidTotal.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-medium text-rose-700">
                              ${order.balance.toFixed(2)}
                            </TableCell>
                            <TableCell>
                              {order.deliveryDate
                                ? new Date(order.deliveryDate).toLocaleDateString("en-US", { timeZone: "UTC" })
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex items-center gap-2">
                                <Link href={`/sales-orders/${order.id}`} className="ios-secondary-btn h-8 px-2 text-xs">
                                  View
                                </Link>
                                <Link href={`/orders/${order.id}/print`} className="ios-secondary-btn h-8 px-2 text-xs">
                                  Print
                                </Link>
                                <a
                                  href={`/api/pdf/sales-order/${order.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="ios-secondary-btn h-8 px-2 text-xs"
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
              </>
            ) : (
              <div className="space-y-3">
                {notes.length === 0 ? (
                  <p className="text-sm text-slate-500">No activity notes yet.</p>
                ) : (
                  notes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-xl">
                      <p className="text-xs text-slate-500">
                        {new Date(note.createdAt).toLocaleString("en-US", { timeZone: "UTC" })}
                        {note.createdBy ? ` · ${note.createdBy}` : ""}
                      </p>
                      <p className="mt-1 text-sm text-slate-800">{note.note}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="linear-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Invoices</h3>
              <Link href="/invoices" className="text-xs text-slate-600 hover:text-slate-900 hover:underline">
                View all
              </Link>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 bg-white/5 hover:bg-white/5">
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-slate-500">
                        No invoices yet.
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
                        className="cursor-pointer border-white/10 text-slate-300 transition-colors hover:bg-white/10"
                      >
                        <TableCell>
                          {new Date(row.issueDate || row.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900">{row.invoiceNumber}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell className="text-right">${Number(row.total).toFixed(2)}</TableCell>
                        <TableCell className="text-right">${Number(row.paidTotal).toFixed(2)}</TableCell>
                        <TableCell className="text-right">${Number(row.balance).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/invoices/${row.id}`}
                            className="ios-secondary-btn h-8 px-2 text-xs"
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

          <div className="linear-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Returns</h3>
              <span className="text-xs text-slate-500">Last 10</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 bg-white/5 hover:bg-white/5">
                    <TableHead>Return #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Credit Amount</TableHead>
                    <TableHead className="text-right">Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-slate-500">
                        No returns yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    returns.map((row) => (
                      <TableRow key={row.id} className="border-white/10 transition-colors hover:bg-white/10">
                        <TableCell className="font-medium text-slate-900">{row.id.slice(0, 8)}</TableCell>
                        <TableCell>
                          {new Date(row.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}
                        </TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell className="text-right">${Number(row.creditAmount).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/returns/${row.id}`} className="ios-secondary-btn h-8 px-2 text-xs">
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

          <div className="linear-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Store Credit</h3>
              <div className="rounded-md bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Open Balance: ${openCreditBalance.toFixed(2)}
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 bg-white/5 hover:bg-white/5">
                    <TableHead>Credit #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Source Return</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openCredits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-slate-500">
                        No open store credits.
                      </TableCell>
                    </TableRow>
                  ) : (
                    openCredits.map((row) => (
                      <TableRow key={row.id} className="border-white/10 transition-colors hover:bg-white/10">
                        <TableCell className="font-medium text-slate-900">{row.id.slice(0, 8)}</TableCell>
                        <TableCell>
                          {new Date(row.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}
                        </TableCell>
                        <TableCell className="text-right">${Number(row.amount).toFixed(2)}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/returns/${row.returnId}`} className="ios-secondary-btn h-8 px-2 text-xs">
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

        <aside className="linear-card p-4">
          <h3 className="text-sm font-semibold text-slate-900">Quick Reminders</h3>
          <div className="mt-3 space-y-2 text-sm">
            <button
              type="button"
              onClick={() => setReminderFilter("PENDING_DELIVERY")}
              className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-slate-300 transition hover:bg-white/10 backdrop-blur-xl"
            >
              <span className="text-slate-700">Pending Delivery</span>
              <span className="font-semibold text-slate-900">{summary?.pendingDeliveryCount ?? 0}</span>
            </button>
            <button
              type="button"
              onClick={() => setReminderFilter("SPECIAL_ORDER")}
              className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-slate-300 transition hover:bg-white/10 backdrop-blur-xl"
            >
              <span className="text-slate-700">Special Orders</span>
              <span className="font-semibold text-slate-900">{summary?.specialOrderCount ?? 0}</span>
            </button>
            <button
              type="button"
              onClick={() => setReminderFilter("UNPAID")}
              className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-slate-300 transition hover:bg-white/10 backdrop-blur-xl"
            >
              <span className="text-slate-700">Unpaid</span>
              <span className="font-semibold text-slate-900">{summary?.unpaidCount ?? 0}</span>
            </button>
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
        <Modal title="Edit Customer" onClose={() => setOpenEditModal(false)}>
          <form className="space-y-3" onSubmit={submitEdit}>
            <InputField label="Name" value={editForm.name} onChange={(value) => setEditForm((prev) => ({ ...prev, name: value }))} required />
            <InputField label="Phone" value={editForm.phone} onChange={(value) => setEditForm((prev) => ({ ...prev, phone: value }))} />
            <InputField label="Email" value={editForm.email} onChange={(value) => setEditForm((prev) => ({ ...prev, email: value }))} />
            <InputField
              label="Install Address"
              value={editForm.installAddress}
              onChange={(value) => setEditForm((prev) => ({ ...prev, installAddress: value }))}
            />
            <InputField
              label="Billing Address"
              value={editForm.billingAddress}
              onChange={(value) => setEditForm((prev) => ({ ...prev, billingAddress: value }))}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <InputField label="City" value={editForm.city} onChange={(value) => setEditForm((prev) => ({ ...prev, city: value }))} />
              <InputField label="State" value={editForm.state} onChange={(value) => setEditForm((prev) => ({ ...prev, state: value }))} />
              <InputField label="Zip Code" value={editForm.zipCode} onChange={(value) => setEditForm((prev) => ({ ...prev, zipCode: value }))} />
            </div>
            <InputField
              label="Company Name"
              value={editForm.companyName}
              onChange={(value) => setEditForm((prev) => ({ ...prev, companyName: value }))}
            />
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Customer Type</span>
              <select
                value={editForm.customerType}
                onChange={(event) =>
                  setEditForm((prev) => ({
                    ...prev,
                    customerType: event.target.value as "RESIDENTIAL" | "COMMERCIAL" | "CONTRACTOR",
                  }))
                }
                className="ios-input h-11 w-full px-3 text-sm"
              >
                <option value="RESIDENTIAL">Residential</option>
                <option value="COMMERCIAL">Commercial</option>
                <option value="CONTRACTOR">Contractor</option>
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
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
                className="h-4 w-4"
              />
              <span className="text-sm text-slate-700">Tax Exempt</span>
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Tax Rate</span>
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
                  className="ios-input h-11 w-full px-3 pr-8 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                  %
                </span>
              </div>
            </label>
            <InputField
              label="Referred By"
              value={editForm.referredBy}
              onChange={(value) => setEditForm((prev) => ({ ...prev, referredBy: value }))}
            />
            <label className="block space-y-1">
              <span className="text-sm text-slate-600">Notes</span>
              <textarea
                value={editForm.notes}
                onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))}
                rows={3}
                className="w-full rounded-xl border border-slate-100 p-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpenEditModal(false)} className="ios-secondary-btn h-10 flex-1">
                Cancel
              </button>
              <button type="submit" disabled={submittingEdit} className="ios-primary-btn h-10 flex-1 disabled:opacity-60">
                {submittingEdit ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-lg border border-slate-200/80 bg-white p-6 shadow-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg px-3 text-sm text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="ios-input h-11 w-full px-3 text-sm"
      />
    </label>
  );
}
