"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeletonRows } from "@/components/ui/table-skeleton";
import { Spinner } from "@/components/ui/spinner";

type Customer = {
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
};

export default function CustomersPage() {
  const router = useRouter();
  const { role } = useRole();
  const [rows, setRows] = useState<Customer[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [defaultTaxRate, setDefaultTaxRate] = useState("0");
  const [newCustomerForm, setNewCustomerForm] = useState({
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
  const [query, setQuery] = useState("");
  const [detailFilter, setDetailFilter] = useState<"ALL" | "PHONE_MISSING" | "EMAIL_MISSING">("ALL");

  const loadRows = async (search = query) => {
    try {
      setLoadingRows(true);
      setError(null);
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const qs = params.toString();
      const res = await fetch(`/api/customers${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
        headers: { "x-user-role": role },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch customers");
      setRows(payload.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch customers");
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    const loadDefaultTaxRate = async () => {
      try {
        const res = await fetch("/api/settings/company", {
          cache: "no-store",
          headers: { "x-user-role": role },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to load default tax rate");
        const nextRate = String(Number(payload.data?.defaultTaxRate ?? 0));
        setDefaultTaxRate(nextRate);
        setNewCustomerForm((prev) => ({ ...prev, taxRate: nextRate }));
      } catch {
        // Keep form usable with fallback zero.
      }
    };
    void loadDefaultTaxRate();
  }, [role]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadRows(query);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleCreateCustomer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittingCreate(true);
    setError(null);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify(newCustomerForm),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to create customer");
      setToast("Customer created successfully.");
      setTimeout(() => setToast(null), 2200);
      setOpenCreateModal(false);
      setNewCustomerForm({
        name: "",
        phone: "",
        email: "",
        installAddress: "",
        billingAddress: "",
        city: "",
        state: "",
        zipCode: "",
        companyName: "",
        customerType: "RESIDENTIAL",
        taxExempt: false,
        taxRate: defaultTaxRate,
        referredBy: "",
        notes: "",
      });
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setSubmittingCreate(false);
    }
  };

  const displayRows = rows.filter((item) => {
    if (detailFilter === "PHONE_MISSING") return !item.phone;
    if (detailFilter === "EMAIL_MISSING") return !item.email;
    return true;
  });

  return (
    <section className="space-y-6">
      <div className="glass-card p-6">
        <div className="glass-card-content flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Customer Management</h1>
            <p className="mt-2 text-sm text-slate-400">View customer records and open warranty/statement pages.</p>
          </div>
          <button
            type="button"
            onClick={() => setOpenCreateModal(true)}
            className="ios-primary-btn inline-flex h-10 items-center gap-2 px-4 text-sm"
          >
            <Plus className="h-4 w-4" />
            Add Customer
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}
      {toast ? (
        <div className="fixed right-6 top-20 z-50 rounded-xl border border-emerald-400/30 bg-emerald-500/20 px-4 py-2 text-sm text-emerald-200 shadow-lg backdrop-blur-xl">
          {toast}
        </div>
      ) : null}

      <div className="glass-card p-4">
        <div className="glass-card-content flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name / phone / email / address"
            className="ios-input h-10 w-full md:max-w-md px-3 text-sm"
          />
          <div className="inline-flex gap-2">
            {(
              [
                ["ALL", "All"],
                ["PHONE_MISSING", "Missing Phone"],
                ["EMAIL_MISSING", "Missing Email"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setDetailFilter(key)}
                className={detailFilter === key ? "so-chip-active" : "so-chip"}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 bg-white/[0.06] hover:bg-white/[0.06]">
              <TableHead className="text-slate-400">Customer</TableHead>
              <TableHead className="text-slate-400">Phone</TableHead>
              <TableHead className="text-slate-400">Email</TableHead>
              <TableHead className="text-slate-400">Install Address</TableHead>
              <TableHead className="text-right text-slate-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingRows && rows.length === 0 ? (
              <TableSkeletonRows columns={5} rows={8} rowClassName="border-white/10" />
            ) : displayRows.length === 0 ? (
              <TableRow className="border-white/10">
                <TableCell colSpan={5} className="py-10 text-center">
                  <p className="text-sm text-slate-500">
                    {rows.length === 0 ? "No customers yet" : "No customers match current filter"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setOpenCreateModal(true)}
                    className="ios-primary-btn mt-3 inline-flex h-9 items-center px-3 text-sm"
                  >
                    Add Customer
                  </button>
                </TableCell>
              </TableRow>
            ) : (
              displayRows.map((item) => (
                <TableRow
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className="group cursor-pointer border-white/10 text-slate-300 transition-colors duration-200 hover:bg-white/[0.06]"
                  onClick={() => router.push(`/customers/${item.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      router.push(`/customers/${item.id}`);
                    }
                  }}
                >
                  <TableCell className="font-semibold text-white group-hover:rounded-l-lg">
                    {item.name}
                  </TableCell>
                  <TableCell className="text-slate-400">{item.phone || "-"}</TableCell>
                  <TableCell className="text-slate-400">{item.email || "-"}</TableCell>
                  <TableCell className="text-slate-400">{item.installAddress || "-"}</TableCell>
                  <TableCell className="text-right group-hover:rounded-r-lg">
                    <div className="inline-flex w-full items-center justify-end gap-2">
                      <button
                        type="button"
                        className="ios-secondary-btn h-9 px-3 py-2 text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/customers/${item.id}`);
                        }}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="ios-secondary-btn h-9 px-3 py-2 text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/sales-orders/new?customerId=${item.id}`);
                        }}
                      >
                        New Order
                      </button>
                      <span
                        className="ml-1 inline-flex items-center text-slate-500 opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100"
                        aria-hidden="true"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {openCreateModal ? (
        <Modal title="Add Customer" onClose={() => setOpenCreateModal(false)}>
          <form className="flex max-h-[80vh] flex-col" onSubmit={handleCreateCustomer}>
            <div className="space-y-3 overflow-y-auto pr-1">
              <InputField
                label="Name"
                value={newCustomerForm.name}
                onChange={(value) => setNewCustomerForm((prev) => ({ ...prev, name: value }))}
                required
              />
              <InputField
                label="Phone"
                value={newCustomerForm.phone}
                onChange={(value) => setNewCustomerForm((prev) => ({ ...prev, phone: value }))}
              />
              <InputField
                label="Email"
                value={newCustomerForm.email}
                onChange={(value) => setNewCustomerForm((prev) => ({ ...prev, email: value }))}
              />
              <InputField
                label="Install Address"
                value={newCustomerForm.installAddress}
                onChange={(value) => setNewCustomerForm((prev) => ({ ...prev, installAddress: value }))}
              />
              <InputField
                label="Billing Address"
                value={newCustomerForm.billingAddress}
                onChange={(value) => setNewCustomerForm((prev) => ({ ...prev, billingAddress: value }))}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <InputField
                  label="City"
                  value={newCustomerForm.city}
                  onChange={(value) => setNewCustomerForm((prev) => ({ ...prev, city: value }))}
                />
                <InputField
                  label="State"
                  value={newCustomerForm.state}
                  onChange={(value) => setNewCustomerForm((prev) => ({ ...prev, state: value }))}
                />
                <InputField
                  label="Zip Code"
                  value={newCustomerForm.zipCode}
                  onChange={(value) => setNewCustomerForm((prev) => ({ ...prev, zipCode: value }))}
                />
              </div>
              <InputField
                label="Company Name"
                value={newCustomerForm.companyName}
                onChange={(value) => setNewCustomerForm((prev) => ({ ...prev, companyName: value }))}
              />
              <label className="block space-y-1">
                <span className="text-sm text-slate-400">Customer Type</span>
                <select
                  value={newCustomerForm.customerType}
                  onChange={(event) =>
                    setNewCustomerForm((prev) => ({
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
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-xl">
                <input
                  type="checkbox"
                  checked={newCustomerForm.taxExempt}
                  onChange={(event) =>
                    setNewCustomerForm((prev) => ({
                      ...prev,
                      taxExempt: event.target.checked,
                      taxRate: event.target.checked ? "" : prev.taxRate || defaultTaxRate,
                    }))
                  }
                  className="h-4 w-4"
                />
                <span className="text-sm text-slate-300">Tax Exempt</span>
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-slate-400">Tax Rate</span>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={newCustomerForm.taxRate}
                    disabled={newCustomerForm.taxExempt}
                    onChange={(event) =>
                      setNewCustomerForm((prev) => ({ ...prev, taxRate: event.target.value }))
                    }
                    className="ios-input h-11 w-full px-3 pr-8 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                    %
                  </span>
                </div>
              </label>
              <InputField
                label="Referred By"
                value={newCustomerForm.referredBy}
                onChange={(value) => setNewCustomerForm((prev) => ({ ...prev, referredBy: value }))}
              />
              <TextareaField
                label="Notes"
                value={newCustomerForm.notes}
                onChange={(value) => setNewCustomerForm((prev) => ({ ...prev, notes: value }))}
              />
            </div>
            <div className="sticky bottom-0 mt-3 flex gap-2 border-t border-white/10 bg-white/5 pt-3 backdrop-blur-xl">
              <button
                type="button"
                onClick={() => setOpenCreateModal(false)}
                className="ios-secondary-btn h-10 flex-1 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingCreate}
                className="ios-primary-btn h-10 flex-1 text-sm disabled:opacity-60"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {submittingCreate ? <Spinner className="text-white/80" /> : null}
                  {submittingCreate ? "Creating..." : "Create Customer"}
                </span>
              </button>
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
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="so-modal-shell w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold tracking-tight text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl px-3 text-sm text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
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
      <span className="text-sm text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="ios-input h-11 w-full px-3 text-sm"
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-slate-400">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="ios-input min-h-[80px] w-full resize-y rounded-xl px-3 py-3 text-sm"
      />
    </label>
  );
}
