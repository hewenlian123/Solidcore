# Solidcore – Full System Overview

**Purpose:** Understand existing modules and features to plan the next development steps for the building materials ERP.

---

## 1. Database Schema Analysis

**Source:** `prisma/schema.prisma`  
**Provider:** PostgreSQL (Supabase)

### 1.1 All Models / Tables

| Table (DB name) | Prisma model | Purpose |
|-----------------|--------------|---------|
| `Product` | Product | **Legacy/inventory products** – warehouse items with category (WINDOW, FLOOR, MIRROR, etc.), specs, cost/sale price, stock per warehouse, reorder levels. Linked to Warehouse, Supplier, InventoryGroup. |
| `product_category_templates` | ProductCategoryTemplate | Templates for product titles/SKU by category (e.g. WINDOW, FLOOR). |
| `product_attributes_dictionary` | ProductAttributeDictionary | Attribute/value/code lookup (e.g. glass type, finish) for catalog. |
| `inventory_groups` | InventoryGroup | Grouping of legacy Products for organization. |
| `Warehouse` | Warehouse | Warehouses (name, address, manager). Products and StockLogs are per warehouse. |
| `Supplier` | Supplier | Suppliers for purchasing and special-order sales. |
| `StockLog` | StockLog | **Stock movement log** – IN/OUT/ADJUST per product, warehouse, optional customer. |
| `Customer` | Customer | **Legacy order customers** – name, phone, install address. Used by Order (production orders). |
| `Order` | Order | **Legacy production orders** – orderNo, status (PENDING_PRODUCTION → SETTLED), total/paid, customer. |
| `OrderItem` | OrderItem | Line items for Order – product, quantity, unitPrice, dimensions, subtotal, stockDeductionQty. |
| `OrderActivity` | OrderActivity | Status change audit for Order (fromStatus → toStatus, operator, note). |
| `AppUser` | AppUser | Users with name, email, role (ADMIN, SALES, WAREHOUSE). |
| `AfterSalesTicket` | AfterSalesTicket | **After-sales tickets** – description, priority, status, linked to Order + Customer. |
| `MaintenanceRecord` | MaintenanceRecord | Maintenance visits/costs per AfterSalesTicket. |
| `Attachment` | Attachment | File attachments for Order or Product (fileUrl, fileType, description). |
| `customers` | SalesCustomer | **Sales customers** – full CRM-style (address, billing, tax, type, notes). Used by SalesOrder, Invoice, etc. |
| `customer_notes` | CustomerNote | Notes on SalesCustomer. |
| `products` | SalesProduct | **Sales catalog** – products with variants, specs, pricing, availableStock. |
| `product_variants` | ProductVariant | Variants of SalesProduct (SKU, dimensions, overrides, reorder levels, isStockItem). |
| `sales_order_counters` | SalesOrderCounter | Year-based counter for sales order numbers. |
| `sales_orders` | SalesOrder | **Sales orders** – orderNumber, customer, docType (QUOTE/SALES_ORDER), status, totals, payments, delivery/pickup, special-order supplier link. |
| `sales_order_items` | SalesOrderItem | Line items for SalesOrder – product/variant snapshots, quantity, unitPrice, lineTotal, fulfillQty, special-order link to PurchaseOrder. |
| `purchase_orders` | PurchaseOrder | **Purchase orders** – header only (poNumber, supplier, status, orderDate, expectedArrival, totalCost). No PO line-items table; linked via SalesOrderItem.linkedPoId for special orders. |
| `sales_order_payments` | SalesOrderPayment | Payments against SalesOrder/Invoice – amount, method, type (DEPOSIT/FINAL/REFUND), status (POSTED/VOIDED). |
| `invoice_counters` | InvoiceCounter | Year-based invoice number counter. |
| `invoices` | Invoice | Invoices – linked to SalesOrder, customer, issue/due date, status, totals, tax. |
| `settings` | Settings | App settings (e.g. default tax rate). |
| `invoice_items` | InvoiceItem | Invoice line items – variant/snapshot, qty, unitPrice, lineTotal. |
| `sales_order_fulfillments` | SalesOrderFulfillment | One fulfillment per SalesOrder – type (PICKUP/DELIVERY), status, schedule, ship-to/driver, inventory deduction tracking. |
| `sales_order_fulfillment_items` | SalesOrderFulfillmentItem | Fulfillment lines – orderedQty, fulfilledQty, link to SalesOrderItem and ProductVariant. |
| `sales_outbound_queue` | SalesOutboundQueue | Queue view for outbound (sales order + fulfillment, status, scheduled date). |
| `inventory_stock` | InventoryStock | **Variant-level stock** – onHand, reserved per ProductVariant. |
| `inventory_movements` | InventoryMovement | **Variant-level movements** – type, qty, unit, linked to variant and optionally fulfillment/fulfillmentItem. |
| `returns` | SalesReturn | **Sales returns** – linked to SalesOrder, fulfillment, invoice; status, refund method, store credit. |
| `return_items` | SalesReturnItem | Return lines – fulfillmentItem, variant, qty. |
| `store_credits` | StoreCredit | Store credit from returns (amount, usedAmount, status). |
| `store_credit_applications` | StoreCreditApplication | Application of store credit to Invoice/Payment. |
| `after_sales_returns` | AfterSalesReturn | **After-sales returns/exchanges** – returnNumber, customer, order/invoice, type, status, refund method. |
| `after_sales_return_items` | AfterSalesReturnItem | Lines for after-sales return (variant, qty, reason, lineRefund). |
| `after_sales_return_events` | AfterSalesReturnEvent | Status/event history for after-sales returns. |
| `sales_order_tickets` | SalesOrderTicket | Tickets tied to sales order/fulfillment (e.g. delivery ticket). |
| `reorder_batch` | ReorderBatch | Reorder batch header (supplier, status). |
| `reorder_batch_items` | ReorderBatchItem | Reorder lines – Product (legacy), qty. |
| `description_templates` | DescriptionTemplate | Category-based description template (templateJson). |

### 1.2 Main Relationships

- **Legacy flow:** `Customer` → `Order` → `OrderItem` → `Product` (Warehouse, Supplier). `Order` → `OrderActivity`; `Order`/`Product` → `Attachment`. `StockLog` links Product, Warehouse, optional Customer.
- **Sales flow:** `SalesCustomer` → `SalesOrder` → `SalesOrderItem` (→ SalesProduct, ProductVariant, optional PurchaseOrder). `SalesOrder` → `SalesOrderPayment`, `Invoice`, `SalesOrderFulfillment`, `SalesReturn`, `AfterSalesReturn`, `SalesOutboundQueue`, `SalesOrderTicket`.
- **Fulfillment:** `SalesOrderFulfillment` → `SalesOrderFulfillmentItem` (→ SalesOrderItem, ProductVariant). `InventoryMovement` links to variant and optionally fulfillment/fulfillmentItem. `InventoryStock` is per ProductVariant.
- **Invoicing:** `Invoice` → `InvoiceItem` (ProductVariant/snapshots). `SalesOrderPayment` can link to Invoice. `StoreCredit` / `StoreCreditApplication` link returns to invoices/payments.
- **Purchasing:** `Supplier` → `PurchaseOrder` (header only). `SalesOrderItem.linkedPoId` → `PurchaseOrder` for special orders. `Supplier` → `ReorderBatch` → `ReorderBatchItem` → `Product`.
- **After-sales:** `Order` + `Customer` → `AfterSalesTicket` → `MaintenanceRecord`. `SalesCustomer` → `AfterSalesReturn` → `AfterSalesReturnItem` / `AfterSalesReturnEvent`.

---

## 2. Backend Logic (API + Lib)

### 2.1 API Routes (by domain)

**Auth & session**  
- `GET/POST /api/auth/session` – session  
- `POST /api/auth/login` – login  
- `POST /api/auth/logout` – logout  

**Orders (legacy production orders)**  
- `GET/POST /api/orders` – list/create Order (Customer, OrderItem, Product)  
- `GET/PATCH /api/orders/[id]` – get/update order  
- `PATCH /api/orders/[id]/status` – change Order status  
- `GET /api/orders/[id]/attachments` – attachments for order  
- `GET /api/orders/snapshot` – snapshot for reporting  

**Sales orders**  
- `GET/POST /api/sales-orders` – list/create SalesOrder  
- `GET/PATCH /api/sales-orders/[id]` – get/update  
- `GET/POST /api/sales-orders/[id]/items` – line items  
- `GET/PATCH /api/sales-orders/[id]/items/[itemId]` – single item  
- `GET/POST /api/sales-orders/[id]/payments` – payments  
- `GET /api/sales-orders/next-number` – next order number  
- `GET /api/sales-orders/[id]/status` – status  
- `GET /api/sales-orders/[id]/convert` – quote → order  
- `GET/POST /api/sales-orders/[id]/fulfillments` – fulfillments  
- `POST /api/sales-orders/[id]/fulfillments/ensure` – ensure one fulfillment exists  
- `GET/PATCH /api/sales-orders/[id]/fulfillments/[fulfillmentId]` – single fulfillment  
- `GET/POST /api/sales-orders/[id]/tickets` – tickets  
- `GET/PATCH /api/sales-orders/[id]/tickets/[ticketId]` – single ticket  
- `GET /api/sales-orders/customers` – customers list  
- `GET /api/sales-orders/products` – products for order  
- `GET /api/sales-orders/salespeople` – salespeople  

**Invoices**  
- `GET/POST /api/invoices` – list/create  
- `GET/PATCH /api/invoices/[id]` – get/update  
- `GET /api/invoices/from-sales-order/[salesOrderId]` – create from sales order  
- `GET/POST /api/invoices/[id]/payments` – payments  
- `GET/PATCH /api/invoices/[id]/payments/[paymentId]` – single payment  
- `PATCH /api/invoices/[id]/mark-sent` – mark sent  
- `POST /api/invoices/[id]/send` – send  
- `POST /api/invoices/[id]/void` – void  
- `GET /api/invoices/[id]/store-credit-preview` – store credit preview  
- `POST /api/invoices/[id]/apply-store-credit` – apply store credit  

**Payments**  
- `POST /api/sales-order-payments/[paymentId]/void` – void payment  
- `GET /api/finance/payments` – finance payments  
- `GET /api/finance/sales-payments` – sales payments  

**Fulfillment & outbound**  
- `GET/POST /api/fulfillment` – create/list fulfillments  
- `GET/POST /api/fulfillment/from-sales-order` – create from sales order  
- `GET/PATCH /api/fulfillment/[id]` – single fulfillment  
- `GET /api/fulfillment/dashboard` – dashboard data  
- `GET/POST /api/fulfillments` – list/create  
- `GET/PATCH /api/fulfillments/[id]` – get/update  
- `PATCH /api/fulfillments/[id]/status` – status  
- `GET /api/fulfillments/outbound` – outbound queue  
- `GET/PATCH /api/fulfillment-items/[id]` – fulfillment item  
- `GET/PATCH /api/fulfillment-item/[id]` – alias  
- `GET /api/fulfillments/[id]/pdf` – fulfillment PDF  
- `GET/POST /api/outbound/sales-orders` – outbound sales orders  

**Customers (Sales)**  
- `GET/POST /api/customers` – list/create SalesCustomer  
- `GET/PATCH /api/customers/[id]` – get/update  
- `GET /api/customers/[id]/orders` – customer orders  
- `GET /api/customers/[id]/invoices` – invoices  
- `GET /api/customers/[id]/notes` – notes  
- `GET/POST /api/customers/[id]/notes` – add note  
- `GET /api/customers/[id]/summary` – summary  
- `GET /api/customers/[id]/statement` – statement  
- `GET /api/customers/[id]/store-credits` – store credits  
- `GET /api/customers/[id]/returns` – returns  
- `GET /api/customers/[id]/warranty` – warranty  

**Products (sales catalog + legacy)**  
- `GET/POST /api/products` – list/create (SalesProduct/Product depending on context)  
- `GET/PATCH /api/products/[id]` – get/update  
- `GET /api/products/[id]/variants` – variants  
- `GET/PATCH /api/products/[id]/variants/[variantId]` – single variant  
- `GET /api/products/[id]/variants/[variantId]/images` – variant images  
- `GET /api/products/[id]/gallery` – gallery  
- `GET /api/products/[id]/stock` – stock  
- `GET /api/products/[id]/inventory` – inventory  
- `GET /api/products/search` – search  
- `GET /api/products/sku/check` – SKU check  
- `POST /api/products/sku/batch-generate` – batch SKU generate  
- `POST /api/products/import` – import  
- `POST /api/products/bulk-group` – bulk group  
- `POST /api/products/bulk-category` – bulk category  

**Inventory**  
- `GET /api/inventory/summary` – summary  
- `GET /api/inventory/stock-count` – stock count  
- `GET/POST /api/inventory/movements` – variant-level movements  
- `GET /api/inventory/movements/export` – export  
- `GET /api/inventory/reorder` – reorder list  
- `POST /api/inventory/reorder` – reorder action  
- `GET /api/inventory/reorder/batches` – reorder batches  
- `GET /api/inventory/alerts` – low-stock alerts  

**Warehouses**  
- `GET/POST /api/warehouses` – list/create  
- `GET/PATCH /api/warehouses/[id]` – get/update  

**Suppliers & purchasing**  
- `GET/POST /api/suppliers` – list/create  
- `GET/PATCH /api/suppliers/[id]` – get/update  
- `GET/POST /api/purchase-orders` – list/create PO (header only)  
- `GET/PATCH /api/purchase-orders/[id]` – get/update  
- `POST /api/purchase-orders/[id]/receive` – receive  
- `GET /api/procurements/draft` – draft procurements  

**Returns**  
- `GET/POST /api/returns` – sales returns  
- `GET/PATCH /api/returns/[id]` – get/update  
- `GET /api/returns/[id]/picker-items` – items for return picker  
- `GET /api/returns/[id]/pdf` – return PDF  

**After-sales**  
- `GET/POST /api/after-sales` – tickets list/create  
- `PATCH /api/after-sales/[id]/status` – ticket status  
- `POST /api/after-sales/[id]/maintenance` – add maintenance record  
- `GET/POST /api/after-sales/returns` – after-sales returns  
- `GET/PATCH /api/after-sales/returns/[id]` – single return  
- `GET /api/after-sales/returns/[id]/pdf` – return PDF  
- `GET /api/after-sales/returns/create-data` – create-data for form  

**Store credits**  
- `GET/POST /api/store-credits` – list/create  
- `GET/PATCH /api/store-credits/[id]` – get/update  

**Finance & reconciliation**  
- `GET /api/finance` – P&L, receivables, cashflow (uses legacy Order)  
- `GET /api/reconciliation` – invoice vs payment reconciliation  
- `PATCH /api/reconciliation` – mark reconciled  
- `GET /api/reconciliation/export` – export  

**Settings & config**  
- `GET/PATCH /api/settings/company` – company settings  
- `GET/POST /api/settings/description-templates` – description templates  
- `GET /api/product-category-templates` – category templates  
- `GET/POST /api/product-attributes-dictionary` – attributes dictionary  

**PDF & reports**  
- `GET /api/pdf/sales-order/[id]` – sales order PDF  
- `GET /api/pdf/invoice/[id]` – invoice PDF  
- `GET /api/pdf/payment/[id]` – payment receipt PDF  
- `GET /api/pdf/reorder-supplier` – reorder PDF  
- `GET /api/reports` – reports  
- `GET /api/dashboard` – dashboard metrics  
- `GET /api/price-list` – price list  
- `GET /api/search/global` – global search  

**Attachments & backup**  
- `GET/DELETE /api/attachments/[id]` – get/delete attachment  
- `GET /api/backup/export` – backup export  

**Special orders**  
- `GET /api/special-orders` – special orders list  

**Archive**  
- `GET /api/archive/yearly` – yearly archive  

**Ping**  
- `GET /api/ping` – health check (e.g. Supabase)  

### 2.2 Lib (selected)

- **Data / ORM:** `prisma.ts` (singleton client), `supabaseClient.ts` (Supabase client for storage/auth if used).  
- **Auth:** `auth-session.ts`, `auth-users.ts`, `server-role.ts` (getRequestRole, deny, hasOneOf).  
- **RBAC:** `rbac.ts` – ROLES (ADMIN, SALES, WAREHOUSE), canViewPath, nextOrderStatus.  
- **Sales & fulfillment:** `sales-orders.ts`, `sales-order-ui.ts`, `fulfillment.ts`, `fulfillment-inventory.ts`, `inventory-movements.ts`, `inventory-safety.ts`, `inventory.ts`.  
- **Invoicing:** `invoices.ts`.  
- **Returns:** `returns.ts`.  
- **Products:** `product-templates.ts`, `product-template-engine.ts`, `product-display-format.ts`, `selling-unit.ts`, `sku/generateVariantSku.ts`, `description/templates.ts`, `description/renderDescription.ts`, `specs/glass.ts`, `specs/effective.ts`.  
- **PDF:** `pdf/generateSalesOrderPDF.ts`, `pdf/generateInvoicePDF.ts`, `pdf/generateFulfillmentPDF.ts`, `pdf/generatePaymentPDF.ts`, `pdf/generateReorderSupplierPDF.ts`, `pdf/generateAfterSalesReturnPDF.ts`, `pdf/theme.ts`, `pdf/export.ts`.  
- **Settings / company:** `settings.ts`, `company-settings.ts`.  
- **Storage:** `storage.ts` (e.g. Supabase storage).  
- **Customers:** `customers/customer-order-metrics.ts`.  
- **Utils:** `utils.ts`, `quantity-format.ts`, `display.ts`, `normalize-nullable-string.ts`.  

---

## 3. Frontend Modules (App Router Pages)

**Navigation (from AppShell/sidebar):**

| Section | Routes | Purpose |
|--------|--------|---------|
| **Sales / Orders** | `/orders`, `/sales-orders`, `/sales-orders/new`, `/sales-orders/edit/[orderId]`, `/sales-orders/[id]`, `/sales-orders/pos` | Legacy orders list; new/view/edit sales orders; POS. |
| | `/invoices`, `/invoices/[id]`, `/invoices/[id]/payments/[paymentId]` | Invoices list, detail, payment. |
| | `/finance/payments` | Payments list. |
| | `/after-sales/returns`, `/after-sales/returns/[id]` | After-sales returns. |
| | `/customers`, `/customers/[id]`, `/customers/[id]/statement` | Sales customers. |
| **Fulfillment / Warehouse** | `/fulfillment/outbound`, `/fulfillment`, `/fulfillment/[id]` | Outbound queue, pickup, fulfillment detail. |
| | `/warehouse/picking`, `/warehouse/packing`, `/warehouse/transfers` | Picking, packing, transfers. |
| | `/delivery`, `/outbound` | Delivery / outbound views. |
| **Inventory & products** | `/inventory`, `/inventory/stock`, `/inventory/reorder`, `/inventory/movements` | Overview, stock, reorder, movements. |
| | `/products`, `/products/[id]` | Product catalog. |
| | `/warehouses` | Warehouses. |
| **Purchasing** | `/purchasing/orders`, `/purchasing/orders/[id]` | Purchase orders. |
| | `/purchasing/receiving` | Receiving. |
| | `/purchasing/bills` | Vendor bills. |
| | `/suppliers`, `/suppliers/[id]` | Suppliers. |
| **After-sales** | `/after-sales` | Tickets. |
| | `/after-sales/store-credit`, `/store-credit` | Store credit. |
| **Finance & analytics** | `/finance`, `/finance/revenue`, `/finance/expenses`, `/finance/profit` | Finance overview; revenue/expenses/profit (expenses = placeholder). |
| | `/reports` | Reports. |
| | `/analytics`, `/analytics/sales`, `/analytics/inventory`, `/analytics/customers` | Analytics. |
| | `/reconciliation` | Invoice/payment reconciliation. |
| **Pricing** | `/price-list`, `/price-management/promotions`, `/price-management/margin` | Price list and margin/promotions. |
| **Settings** | `/settings`, `/settings/users`, `/settings/roles`, `/settings/tax`, `/settings/integrations` | Company, users, roles, tax, integrations. |
| **Other** | `/dashboard` | Dashboard (KPIs, recent orders, trends). |
| | `/login` | Login. |
| | `/returns`, `/returns/[id]` | Returns (sales returns). |
| | `/tickets` | Tickets. |
| | `/special-orders` | Special orders. |

Role-based visibility: ADMIN sees all; SALES sees sales, customers, invoices, payments, inventory (read), purchasing, after-sales, finance, analytics; WAREHOUSE sees fulfillment, warehouse, inventory, products.

---

## 4. Implemented ERP Features (Present)

| Feature | Status | Notes |
|--------|--------|-------|
| **Product management** | ✅ | Dual: legacy Product (warehouse/cost/specs) and SalesProduct + ProductVariant (catalog, SKU, pricing). Category templates, attribute dictionary, description templates. |
| **Customer management** | ✅ | Legacy Customer (Order); SalesCustomer (SalesOrder, Invoice, notes, store credits, returns). |
| **Supplier management** | ✅ | Supplier CRUD; linked to Product, PurchaseOrder, ReorderBatch, special SalesOrder. |
| **Sales orders** | ✅ | Full flow: quote → order, items, payments, status, fulfillment method, delivery/pickup. |
| **Order items** | ✅ | SalesOrderItem with product/variant snapshots, fulfillQty, special-order link to PO. |
| **Inventory** | ✅ | Legacy: Product.currentStock per Warehouse; StockLog (IN/OUT/ADJUST). Variant: InventoryStock (onHand, reserved), InventoryMovement. |
| **Warehouse** | ✅ | Multi-warehouse; Product and StockLog per warehouse. |
| **Stock movement logs** | ✅ | StockLog (legacy product); InventoryMovement (variant, linked to fulfillment). |
| **Invoice system** | ✅ | Invoice from SalesOrder, InvoiceItem, numbering, tax, void, mark-sent, send. |
| **Payment tracking** | ✅ | SalesOrderPayment (method, type, status, link to invoice); void; finance payments API. |
| **Attachments / files** | ✅ | Attachment for Order and Product; storage (e.g. Supabase) in lib. |
| **After-sales / maintenance** | ✅ | AfterSalesTicket + MaintenanceRecord (legacy Order); AfterSalesReturn (SalesCustomer, refund/store credit). |
| **Quotation / estimate** | ✅ | SalesOrder with docType QUOTE; convert to SALES_ORDER. |
| **Shipment / delivery** | ✅ | SalesOrderFulfillment (PICKUP/DELIVERY), status flow, schedule, ship-to, driver, inventory deduction. |
| **Return management** | ✅ | SalesReturn (from order/fulfillment/invoice), return items, store credit; AfterSalesReturn for formal returns/exchanges. |
| **Multi-warehouse** | ✅ | Warehouse model; Product.warehouseId; StockLog per warehouse. (Variant stock is global in InventoryStock.) |
| **Role permissions** | ✅ | ADMIN, SALES, WAREHOUSE in AppUser and rbac; canViewPath; nav and API protected by role. |
| **Dashboard analytics** | ✅ | Dashboard API and page (today revenue, orders, receivables, low stock); analytics pages (sales, inventory, customers). |
| **Reconciliation** | ✅ | Invoice vs payment reconciliation API and page; mark reconciled. |
| **Purchase orders** | ⚠️ Partial | Header-only PO (supplier, status, dates, totalCost); API create/list/receive. No PO line-items table; special orders link via SalesOrderItem.linkedPoId. |
| **Finance / P&L** | ⚠️ Partial | Finance API uses legacy Order for P&L, receivables, cashflow. Revenue/profit pages exist; Expenses page is placeholder. |

---

## 5. Missing or Weak ERP Features

Compared to a typical building-materials ERP:

| Gap | Detail |
|-----|--------|
| **Purchase order line items** | No `PurchaseOrderItem` (or similar); PO is header-only. Receiving and cost rollback are limited without line-level PO data. |
| **Vendor bills / AP** | Purchasing/bills page exists but no schema or API for vendor bills (AP). |
| **Expenses / general ledger** | No expense or GL model; finance/expenses is placeholder. |
| **Accounting / finance** | No chart of accounts, journals, or period close. Finance is reporting on orders/invoices, not full accounting. |
| **Unified order model** | Two order systems (Order vs SalesOrder) and two customer/product models; more integration and reporting complexity. |
| **Inventory costing** | No explicit costing method (e.g. FIFO/avg) or cost layers; cost on Product/SalesProduct/variant only. |
| **Quotation PDF** | Quote flow exists; dedicated quote PDF/print may be partial. |
| **Audit trail** | OrderActivity for legacy Order; no full audit log for all key entities. |
| **Dashboard on SalesOrder** | Dashboard API may still use legacy Order for some metrics; full SalesOrder-based dashboard could be desired. |

---

## 6. System Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Frontend                                                                │
│  Next.js 15 (App Router), React, Tailwind, Framer Motion, TanStack Query │
│  AppShell + sidebar (role-based nav), PWA, role provider                 │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Backend                                                                 │
│  Next.js Route Handlers (App Router) in /app/api/**/route.ts             │
│  Lib: Prisma (ORM), auth-session, server-role, rbac, fulfillment,        │
│       invoices, inventory, PDF generators, storage (Supabase)            │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
┌───────────────────────────────┐     ┌──────────────────────────────────┐
│  Database                      │     │  Supabase (optional)              │
│  Supabase PostgreSQL           │     │  Storage (attachments), auth ping │
│  Prisma migrations             │     │  (if used)                        │
└───────────────────────────────┘     └──────────────────────────────────┘
```

- **Auth:** Session-based (auth/session, login/logout); role from session (ADMIN/SALES/WAREHOUSE).  
- **Files:** Attachments stored via Supabase storage (lib/storage).  
- **PDFs:** Server-side generation (jsPDF, etc.) in lib/pdf.  

---

## 7. Recommendations – Next 5 Priorities

1. **Purchase order line items and receiving**  
   Add `PurchaseOrderItem` (or equivalent) and receiving against PO lines; optionally link to Supplier and to inventory (e.g. Product or ProductVariant). This completes procurement and improves cost and stock accuracy.

2. **Unify or clearly split the two order systems**  
   Either migrate remaining flows from legacy Order/Customer/Product to SalesOrder/SalesCustomer/SalesProduct, or document and consolidate reporting so dashboard and finance use one primary source (e.g. SalesOrder + Invoice) and legacy Order is phased out or read-only.

3. **Vendor bills (AP) and basic expenses**  
   Add vendor bill (and optionally bill line) model and APIs so “Vendor Bills” is real AP; add a simple expense model and wire finance/expenses page to it for basic expense tracking.

4. **Finance dashboard and reporting on SalesOrder**  
   Ensure dashboard and finance APIs use SalesOrder/Invoice/Payment as the main source for revenue, receivables, and cashflow; keep or phase legacy Order for historical P&L only.

5. **Role-based access enforcement and audit**  
   Harden API and UI so every sensitive route checks role (and optionally resource-level permissions). Add a simple audit log for key actions (order create/update, payment, invoice void, etc.) to support compliance and support.

---

*Generated from codebase analysis. Schema and routes current as of the last scan.*
