export type MenuItem = {
  label: string;
  icon: string;
  href: string;
  active?: boolean;
};

export type KpiItem = {
  title: string;
  value: string;
  delta: string;
  positive: boolean;
  accent: "blue" | "orange" | "green" | "amber";
  sparkline?: number[];
  progress?: number;
  warning?: string;
};

export type SalesTrendPoint = {
  day: string;
  revenue: number;
  orders: number;
};

export type TopProductRow = {
  id: string;
  name: string;
  sku: string;
  sales: number;
  revenue: number;
  trend: string;
};

export type RecentOrderRow = {
  id: string;
  customer: string;
  date: string;
  total: string;
  status: "Paid" | "Pending" | "Shipped" | "Overdue";
  payment: "Credit Card" | "PayPal" | "Bank Transfer" | "Stripe";
};

export type RegionRow = {
  region: string;
  value: number;
  color: string;
};

export const dashboardMenu: MenuItem[] = [
  { label: "Dashboard", icon: "LayoutDashboard", href: "/dashboard", active: true },
  { label: "Orders", icon: "ShoppingBag", href: "/orders" },
  { label: "Price List", icon: "Tag", href: "/price-list" },
  { label: "Invoices", icon: "ReceiptText", href: "/invoices" },
  { label: "Customers", icon: "Users", href: "/customers" },
  { label: "Inventory", icon: "Package", href: "/inventory" },
  { label: "After-Sales", icon: "ShieldCheck", href: "/after-sales" },
  { label: "Tickets", icon: "Ticket", href: "/tickets" },
  { label: "Returns", icon: "RotateCcw", href: "/returns" },
  { label: "Store Credit", icon: "Wallet", href: "/store-credit" },
  { label: "Analytics", icon: "LineChart", href: "/analytics" },
  { label: "Settings", icon: "Settings", href: "/settings" },
];

export const kpiItems: KpiItem[] = [
  {
    title: "Today Sales",
    value: "$25,480",
    delta: "+12.5%",
    positive: true,
    accent: "blue",
    sparkline: [16, 20, 22, 21, 24, 27, 25],
  },
  {
    title: "Orders Today",
    value: "142",
    delta: "-3.2%",
    positive: false,
    accent: "orange",
    sparkline: [20, 22, 19, 18, 17, 16, 15],
  },
  {
    title: "Payments Collected",
    value: "$18,750",
    delta: "+18.2%",
    positive: true,
    accent: "green",
    progress: 74,
    sparkline: [14, 16, 17, 18, 20, 19, 21],
  },
  {
    title: "Inventory Value",
    value: "$61,988",
    delta: "Watch stock",
    positive: false,
    accent: "amber",
    progress: 62,
    sparkline: [24, 23, 22, 21, 20, 19, 18],
    warning: "12 low-stock items",
  },
];

export const salesTrend: SalesTrendPoint[] = [
  { day: "Mon", revenue: 22000, orders: 104 },
  { day: "Tue", revenue: 26500, orders: 132 },
  { day: "Wed", revenue: 24100, orders: 118 },
  { day: "Thu", revenue: 29800, orders: 144 },
  { day: "Fri", revenue: 32560, orders: 166 },
  { day: "Sat", revenue: 30100, orders: 158 },
  { day: "Sun", revenue: 28700, orders: 146 },
];

export const topProducts: TopProductRow[] = [
  { id: "1", name: "Cement 42.5kg", sku: "CEM-001", sales: 1240, revenue: 12480, trend: "+8.4%" },
  { id: "2", name: "Steel Rods", sku: "STE-002", sales: 980, revenue: 8920, trend: "+6.9%" },
  { id: "3", name: "Paint Bucket", sku: "PNT-003", sales: 760, revenue: 5360, trend: "+5.2%" },
  { id: "4", name: "Tiles 800x800", sku: "TLS-004", sales: 520, revenue: 4180, trend: "+3.8%" },
  { id: "5", name: "Bricks Red", sku: "BRK-005", sales: 430, revenue: 3120, trend: "+2.5%" },
];

export const recentOrders: RecentOrderRow[] = [
  { id: "SO-2048", customer: "Skyline Projects", date: "2026-03-01", total: "$4,280", status: "Paid", payment: "Credit Card" },
  { id: "SO-2047", customer: "North Build Co.", date: "2026-03-01", total: "$2,910", status: "Pending", payment: "PayPal" },
  { id: "SO-2046", customer: "Oakline Homes", date: "2026-02-28", total: "$6,420", status: "Shipped", payment: "Bank Transfer" },
  { id: "SO-2045", customer: "Riverfront Dev", date: "2026-02-28", total: "$1,870", status: "Overdue", payment: "Stripe" },
  { id: "SO-2044", customer: "Urban Brick Ltd", date: "2026-02-27", total: "$3,540", status: "Paid", payment: "Credit Card" },
];

export const salesByRegion: RegionRow[] = [
  { region: "North", value: 40, color: "#FACC15" },
  { region: "South", value: 30, color: "#3B82F6" },
  { region: "East", value: 20, color: "#F59E0B" },
  { region: "West", value: 10, color: "#EF4444" },
];

export const customersOverview = {
  newCustomers: { count: 92, delta: "+11.6%" },
  returningCustomers: { count: 64, delta: "+11.8%" },
};
