"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRole } from "@/components/layout/role-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  installAddress: string | null;
  notes: string | null;
};

export default function CustomersPage() {
  const router = useRouter();
  const { role } = useRole();
  const [rows, setRows] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: "",
    phone: "",
    email: "",
    installAddress: "",
    notes: "",
  });
  const [query, setQuery] = useState("");
  const [detailFilter, setDetailFilter] = useState<"ALL" | "PHONE_MISSING" | "EMAIL_MISSING">("ALL");

  const loadRows = async (search = query) => {
    try {
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
    }
  };

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <section className="space-y-8">
      <div className="linear-card flex items-center justify-between gap-3 p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Customer Management</h1>
          <p className="mt-2 text-sm text-slate-500">View customer records and open warranty/statement pages.</p>
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

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}
      {toast ? (
        <div className="fixed right-6 top-20 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 shadow">
          {toast}
        </div>
      ) : null}

      <div className="linear-card space-y-3 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
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
                className={`rounded-xl px-3 py-1.5 text-xs ${
                  detailFilter === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="linear-card overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Install Address</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayRows.length === 0 ? (
              <TableRow>
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
                  className="group h-14 cursor-pointer odd:bg-white even:bg-slate-50/40 transition-colors duration-200 hover:bg-slate-100/70"
                  onClick={() => router.push(`/customers/${item.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      router.push(`/customers/${item.id}`);
                    }
                  }}
                >
                  <TableCell className="font-semibold text-slate-900 group-hover:rounded-l-lg">
                    {item.name}
                  </TableCell>
                  <TableCell>{item.phone || "-"}</TableCell>
                  <TableCell>{item.email || "-"}</TableCell>
                  <TableCell>{item.installAddress || "-"}</TableCell>
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
                        className="ml-1 inline-flex items-center text-slate-400 opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100"
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
          <form className="space-y-3" onSubmit={handleCreateCustomer}>
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
            <TextareaField
              label="Notes"
              value={newCustomerForm.notes}
              onChange={(value) => setNewCustomerForm((prev) => ({ ...prev, notes: value }))}
            />
            <div className="flex gap-2 pt-1">
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
                {submittingCreate ? "Creating..." : "Create Customer"}
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
      <span className="text-sm text-slate-600">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full rounded-xl border border-slate-100 p-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}
