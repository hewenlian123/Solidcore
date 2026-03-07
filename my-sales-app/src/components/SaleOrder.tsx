"use client";

import { useState } from "react";
import { Plus, Trash2, Save, Check, Calendar, User, Phone, MapPin, FileText, DollarSign } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";

interface OrderItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

type OrderStatus = "draft" | "confirmed" | "paid";

export function SaleOrder() {
  const [orderNumber, setOrderNumber] = useState(`SO-${Date.now().toString().slice(-6)}`);
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0]);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("draft");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  const [items, setItems] = useState<OrderItem[]>([{ id: "1", productName: "", unitPrice: 0, quantity: 1 }]);

  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(0.1);
  const [notes, setNotes] = useState("");

  const addItem = () => {
    setItems([
      ...items,
      {
        id: Date.now().toString(),
        productName: "",
        unitPrice: 0,
        quantity: 1,
      },
    ]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof OrderItem, value: string | number) => {
    setItems(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  };

  const calculateTax = () => {
    return (calculateSubtotal() - discount) * taxRate;
  };

  const calculateTotal = () => {
    return calculateSubtotal() - discount + calculateTax();
  };

  const handleSave = () => {
    setOrderStatus("draft");
    alert("Order saved!");
  };

  const handleConfirm = () => {
    setOrderStatus("confirmed");
    alert("Order confirmed!");
  };

  const getStatusBadge = () => {
    const badges = {
      draft: (
        <Badge variant="secondary" className="border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-light tracking-[0.2em] text-amber-700">
          DRAFT
        </Badge>
      ),
      confirmed: (
        <Badge className="border-0 bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-1 text-[10px] font-light tracking-[0.2em]">
          CONFIRMED
        </Badge>
      ),
      paid: (
        <Badge className="border-0 bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1 text-[10px] font-light tracking-[0.2em]">
          PAID
        </Badge>
      ),
    };
    return badges[orderStatus];
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-amber-900/10 via-transparent to-transparent" />

      <div className="relative mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6">
          <div className="overflow-hidden rounded-xl border border-slate-200/50 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-2xl">
            <div className="h-1 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-400" />

            <div className="px-8 py-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="mb-3 flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 shadow-lg">
                      <FileText className="h-5 w-5 text-amber-400" strokeWidth={1.5} />
                    </div>
                    <div>
                      <h1 className="mb-1 text-3xl tracking-tight text-slate-900" style={{ fontWeight: 300, letterSpacing: "-0.02em" }}>
                        Sales Order
                      </h1>
                      <p className="text-[10px] uppercase tracking-widest text-slate-500" style={{ letterSpacing: "0.15em" }}>
                        Professional Invoice System
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">{getStatusBadge()}</div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleSave}
                    className="h-10 gap-2 rounded-lg border-slate-300 px-5 text-sm transition-all duration-300 hover:border-slate-400 hover:bg-slate-50"
                  >
                    <Save className="h-3.5 w-3.5" strokeWidth={1.5} />
                    <span className="tracking-wider">Save</span>
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    className="h-10 gap-2 rounded-lg bg-gradient-to-r from-slate-800 to-slate-900 px-5 text-sm shadow-lg transition-all duration-300 hover:from-slate-900 hover:to-black hover:shadow-xl"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                    <span className="tracking-wider">Confirm</span>
                  </Button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-6 border-t border-slate-200 pt-6">
                <div className="group">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 transition-shadow group-hover:shadow-md">
                      <Calendar className="h-4 w-4 text-blue-600" strokeWidth={1.5} />
                    </div>
                    <Label className="text-[9px] font-medium uppercase tracking-[0.2em] text-slate-500">Order Number</Label>
                  </div>
                  <Input
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    className="h-auto rounded-none border-0 border-b-2 border-slate-200 bg-transparent px-0 pb-1 text-lg font-light transition-colors focus-visible:border-slate-400 focus-visible:ring-0"
                  />
                </div>
                <div className="group">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-50 to-pink-50 transition-shadow group-hover:shadow-md">
                      <Calendar className="h-4 w-4 text-purple-600" strokeWidth={1.5} />
                    </div>
                    <Label className="text-[9px] font-medium uppercase tracking-[0.2em] text-slate-500">Order Date</Label>
                  </div>
                  <Input
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="h-auto rounded-none border-0 border-b-2 border-slate-200 bg-transparent px-0 pb-1 text-lg font-light transition-colors focus-visible:border-slate-400 focus-visible:ring-0"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="overflow-hidden rounded-xl border border-slate-200/50 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-2xl">
            <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-8 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
                  <User className="h-4.5 w-4.5 text-white" strokeWidth={1.5} />
                </div>
                <div>
                  <h2 className="text-lg tracking-tight text-slate-900" style={{ fontWeight: 300 }}>
                    Customer Information
                  </h2>
                  <p className="text-[9px] uppercase tracking-wider text-slate-500" style={{ letterSpacing: "0.15em" }}>
                    Billing & Contact
                  </p>
                </div>
              </div>
            </div>

            <div className="px-8 py-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="group">
                  <div className="mb-2 flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.5} />
                    <Label className="text-[9px] font-medium uppercase tracking-[0.2em] text-slate-500">Full Name</Label>
                  </div>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter customer name"
                    className="h-11 rounded-lg border-slate-200 bg-white px-4 text-sm transition-all duration-300 focus:border-slate-400 group-hover:shadow-md"
                  />
                </div>

                <div className="group">
                  <div className="mb-2 flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.5} />
                    <Label className="text-[9px] font-medium uppercase tracking-[0.2em] text-slate-500">Phone Number</Label>
                  </div>
                  <Input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Enter phone number"
                    className="h-11 rounded-lg border-slate-200 bg-white px-4 text-sm transition-all duration-300 focus:border-slate-400 group-hover:shadow-md"
                  />
                </div>

                <div className="col-span-2 group">
                  <div className="mb-2 flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.5} />
                    <Label className="text-[9px] font-medium uppercase tracking-[0.2em] text-slate-500">Address</Label>
                  </div>
                  <Input
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Enter complete address"
                    className="h-11 rounded-lg border-slate-200 bg-white px-4 text-sm transition-all duration-300 focus:border-slate-400 group-hover:shadow-md"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="overflow-hidden rounded-xl border border-slate-200/50 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-2xl">
            <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-8 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
                    <DollarSign className="h-4.5 w-4.5 text-white" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h2 className="text-lg tracking-tight text-slate-900" style={{ fontWeight: 300 }}>
                      Order Items
                    </h2>
                    <p className="text-[9px] uppercase tracking-wider text-slate-500" style={{ letterSpacing: "0.15em" }}>
                      Products & Quantities
                    </p>
                  </div>
                </div>

                <Button
                  onClick={addItem}
                  variant="outline"
                  className="h-9 gap-2 rounded-lg border-2 border-blue-200 px-4 text-sm text-blue-600 transition-all duration-300 hover:border-blue-300 hover:bg-blue-50"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  <span className="font-medium tracking-wider">Add</span>
                </Button>
              </div>
            </div>

            <div>
              <div className="grid grid-cols-12 gap-4 border-b-2 border-slate-200 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 px-8 py-4">
                <div className="col-span-5 text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-600">Product</div>
                <div className="col-span-2 text-center text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-600">Qty</div>
                <div className="col-span-2 text-right text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-600">Price</div>
                <div className="col-span-2 text-right text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-600">Amount</div>
                <div className="col-span-1" />
              </div>

              <div className="divide-y divide-slate-100">
                {items.map((item) => (
                  <div key={item.id} className="group grid grid-cols-12 items-center gap-4 px-8 py-4 transition-all duration-300 hover:bg-slate-50/80">
                    <div className="col-span-5">
                      <Input
                        value={item.productName}
                        onChange={(e) => updateItem(item.id, "productName", e.target.value)}
                        placeholder="Product name"
                        className="h-10 rounded-lg border-slate-200 bg-white text-sm transition-all duration-300 focus:border-slate-400 group-hover:shadow-md"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity || ""}
                        onChange={(e) => updateItem(item.id, "quantity", parseInt(e.target.value, 10) || 1)}
                        className="h-10 rounded-lg border-slate-200 bg-white text-center text-sm font-medium transition-all duration-300 focus:border-slate-400 group-hover:shadow-md"
                      />
                    </div>
                    <div className="col-span-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-light text-slate-400">$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unitPrice || ""}
                          onChange={(e) => updateItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="h-10 rounded-lg border-slate-200 bg-white pl-7 text-right text-sm transition-all duration-300 focus:border-slate-400 group-hover:shadow-md"
                        />
                      </div>
                    </div>
                    <div className="col-span-2 text-right">
                      <div className="text-lg font-light tracking-tight text-slate-900">${(item.unitPrice * item.quantity).toFixed(2)}</div>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(item.id)}
                        disabled={items.length === 1}
                        className="h-8 w-8 rounded-lg text-red-400 transition-all duration-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-6">
          <div className="col-span-3">
            <div className="h-full overflow-hidden rounded-xl border border-slate-200/50 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-2xl">
              <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-8 py-5">
                <h2 className="text-lg tracking-tight text-slate-900" style={{ fontWeight: 300 }}>
                  Additional Notes
                </h2>
                <p className="mt-0.5 text-[9px] uppercase tracking-wider text-slate-500" style={{ letterSpacing: "0.15em" }}>
                  Terms & Instructions
                </p>
              </div>
              <div className="px-8 py-6">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Enter any additional notes, terms, or special instructions..."
                  className="min-h-36 resize-none rounded-lg border-slate-200 bg-white text-sm leading-relaxed transition-all duration-300 focus:border-slate-400"
                />
              </div>
            </div>
          </div>

          <div className="col-span-2">
            <div className="overflow-hidden rounded-xl border border-slate-700/50 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-2xl">
              <div className="h-1 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-400" />

              <div className="border-b border-slate-700/50 px-6 py-5">
                <h2 className="text-lg tracking-tight text-white" style={{ fontWeight: 300 }}>
                  Summary
                </h2>
              </div>

              <div className="px-6 py-6">
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-slate-400">Subtotal</span>
                    <span className="text-lg font-light tracking-tight text-white">${calculateSubtotal().toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-slate-400">Discount</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={discount || ""}
                        onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="h-9 w-24 rounded-lg border-slate-600 bg-slate-800/50 text-right text-sm text-white focus:border-slate-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-slate-400">Tax</span>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <span>(</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={taxRate}
                          onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                          className="h-7 w-14 rounded-lg border-slate-600 bg-slate-800/50 px-1 text-center text-xs text-white"
                        />
                        <span>)</span>
                      </div>
                    </div>
                    <span className="text-lg font-light tracking-tight text-white">${calculateTax().toFixed(2)}</span>
                  </div>

                  <div className="my-5 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent" />

                  <div className="-mx-6 rounded-lg border border-amber-500/30 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 px-5 py-5 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="mb-1 text-[9px] font-medium uppercase tracking-[0.25em] text-amber-300">Total</div>
                        <div className="text-[10px] tracking-wider text-amber-200/60">Due on receipt</div>
                      </div>
                      <div className="text-3xl font-extralight tracking-tighter text-white">${calculateTotal().toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
