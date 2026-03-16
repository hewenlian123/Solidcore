-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('WINDOW', 'FLOOR', 'FLOOR_ACCESSORIES', 'LED_MIRROR', 'MIRROR', 'TILE_EDGE', 'SHAMPOO_NICHE', 'SHOWER_DOOR', 'DOOR', 'WAREHOUSE_SUPPLY', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('SQM', 'SET', 'PIECE', 'SHEET');

-- CreateEnum
CREATE TYPE "StockAction" AS ENUM ('IN', 'OUT', 'ADJUST');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PRODUCTION', 'IN_PRODUCTION', 'READY_DELIVERY', 'SETTLED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SALES', 'WAREHOUSE');

-- CreateEnum
CREATE TYPE "AfterSalesStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'QUOTED', 'CONFIRMED', 'READY', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesPaymentMethod" AS ENUM ('CASH', 'CHECK', 'CARD', 'BANK', 'OTHER', 'STORE_CREDIT');

-- CreateEnum
CREATE TYPE "SalesPaymentStatus" AS ENUM ('POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "SalesPaymentType" AS ENUM ('DEPOSIT', 'FINAL', 'REFUND');

-- CreateEnum
CREATE TYPE "SalesCustomerType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'CONTRACTOR');

-- CreateEnum
CREATE TYPE "SalesDocType" AS ENUM ('QUOTE', 'SALES_ORDER');

-- CreateEnum
CREATE TYPE "SalesOrderFulfillmentMethod" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "SalesFulfillmentType" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "SalesFulfillmentStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PACKING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED_UP', 'OUT', 'PARTIAL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StoreCreditStatus" AS ENUM ('OPEN', 'USED', 'VOID');

-- CreateEnum
CREATE TYPE "AfterSalesReturnType" AS ENUM ('RETURN', 'EXCHANGE');

-- CreateEnum
CREATE TYPE "AfterSalesReturnStatus" AS ENUM ('DRAFT', 'APPROVED', 'RECEIVED', 'REFUNDED', 'CLOSED', 'VOID');

-- CreateEnum
CREATE TYPE "AfterSalesRefundMethod" AS ENUM ('STORE_CREDIT', 'REFUND_PAYMENT', 'NO_REFUND');

-- CreateEnum
CREATE TYPE "GlassType" AS ENUM ('TEMPERED_LOW_E_5MM', 'TEMPERED_LOW_E_5MM_FROSTED', 'TEMPERED_CLEAR_5MM', 'OTHER');

-- CreateEnum
CREATE TYPE "GlassFinish" AS ENUM ('CLEAR', 'FROSTED');

-- CreateEnum
CREATE TYPE "FlooringMaterial" AS ENUM ('SPC', 'LVP', 'LAMINATE', 'HARDWOOD');

-- CreateEnum
CREATE TYPE "FlooringFinish" AS ENUM ('MATTE', 'GLOSS', 'EMBOSSED');

-- CreateEnum
CREATE TYPE "FlooringEdge" AS ENUM ('BEVEL', 'MICRO_BEVEL', 'SQUARE');

-- CreateEnum
CREATE TYPE "FlooringInstallation" AS ENUM ('CLICK', 'GLUE_DOWN');

-- CreateEnum
CREATE TYPE "FlooringUnderlayment" AS ENUM ('ATTACHED', 'NONE');

-- CreateEnum
CREATE TYPE "FlooringWaterResistance" AS ENUM ('WATERPROOF', 'WATER_RESISTANT');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "galleryImageUrl" TEXT,
    "specification" TEXT,
    "category" "ProductCategory" NOT NULL,
    "customCategoryName" TEXT,
    "brand" TEXT,
    "collection" TEXT,
    "model" TEXT,
    "material" TEXT,
    "type" TEXT,
    "style" TEXT,
    "screen_type" TEXT,
    "color" TEXT,
    "finish" TEXT,
    "sizeW" DECIMAL(65,30),
    "sizeH" DECIMAL(65,30),
    "thicknessMm" DECIMAL(65,30),
    "glass" TEXT,
    "glass_type_default" TEXT,
    "glass_finish_default" TEXT,
    "screen_default" TEXT,
    "opening_type_default" TEXT,
    "frame_material_default" TEXT,
    "sliding_config_default" TEXT,
    "glass_coating_default" TEXT,
    "glass_thickness_mm_default" INTEGER,
    "flooring_brand" TEXT,
    "flooring_series" TEXT,
    "flooring_material" "FlooringMaterial",
    "flooring_wear_layer" TEXT,
    "flooring_thickness_mm" DECIMAL(65,30),
    "flooring_plank_length_in" DECIMAL(65,30),
    "flooring_plank_width_in" DECIMAL(65,30),
    "flooring_core_thickness_mm" DECIMAL(65,30),
    "flooring_finish" "FlooringFinish",
    "flooring_edge" "FlooringEdge",
    "flooring_installation" "FlooringInstallation",
    "flooring_underlayment" "FlooringUnderlayment",
    "flooring_underlayment_type" TEXT,
    "flooring_underlayment_mm" DECIMAL(65,30),
    "flooring_water_resistance" "FlooringWaterResistance",
    "flooring_waterproof" BOOLEAN,
    "flooring_warranty_residential_yr" INTEGER,
    "flooring_warranty_commercial_yr" INTEGER,
    "flooring_pieces_per_box" INTEGER,
    "flooring_box_coverage_sqft" DECIMAL(65,30),
    "flooring_low_stock_threshold" DECIMAL(65,30),
    "rating" TEXT,
    "swing" TEXT,
    "handing" TEXT,
    "uom" TEXT,
    "price" DECIMAL(65,30),
    "cost" DECIMAL(65,30),
    "sku" TEXT,
    "title" TEXT,
    "titleOverride" BOOLEAN NOT NULL DEFAULT false,
    "skuOverride" BOOLEAN NOT NULL DEFAULT false,
    "default_description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "unit" "ProductUnit" NOT NULL,
    "costPrice" DECIMAL(65,30) NOT NULL,
    "salePrice" DECIMAL(65,30) NOT NULL,
    "currentStock" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "minStock" DECIMAL(65,30) NOT NULL DEFAULT 10,
    "reorder_level" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reorder_qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "warehouseId" TEXT NOT NULL,
    "supplierId" TEXT,
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_category_templates" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "categoryLabel" TEXT NOT NULL,
    "titleTemplate" TEXT NOT NULL,
    "skuTemplate" TEXT NOT NULL,
    "requiredFields" JSONB NOT NULL,
    "fieldOrder" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_category_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_attributes_dictionary" (
    "id" TEXT NOT NULL,
    "attribute" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "categoryId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_attributes_dictionary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "managerName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLog" (
    "id" TEXT NOT NULL,
    "action" "StockAction" NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "customerId" TEXT,

    CONSTRAINT "StockLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "installAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PRODUCTION',
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "customerId" TEXT NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "lengthMm" INTEGER,
    "widthMm" INTEGER,
    "areaSqm" DECIMAL(65,30),
    "subtotal" DECIMAL(65,30) NOT NULL,
    "stockDeductionQty" DECIMAL(65,30) NOT NULL,
    "warrantyExpiry" TIMESTAMP(3),
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderActivity" (
    "id" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "operatorId" TEXT,
    "operator" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" TEXT NOT NULL,

    CONSTRAINT "OrderActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'SALES',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AfterSalesTicket" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "appointmentAt" TIMESTAMP(3),
    "assignedTechnician" TEXT,
    "status" "AfterSalesStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,

    CONSTRAINT "AfterSalesTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "cost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" TEXT NOT NULL,

    CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "description" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT,
    "productId" TEXT,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "billing_address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip_code" TEXT,
    "company_name" TEXT,
    "customer_type" "SalesCustomerType",
    "tax_exempt" BOOLEAN NOT NULL DEFAULT false,
    "tax_rate" DECIMAL(65,30),
    "referred_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_notes" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "default_description" TEXT,
    "glass_type_default" TEXT,
    "glass_finish_default" TEXT,
    "screen_default" TEXT,
    "opening_type_default" TEXT,
    "frame_material_default" TEXT,
    "sliding_config_default" TEXT,
    "glass_coating_default" TEXT,
    "glass_thickness_mm_default" INTEGER,
    "flooring_brand" TEXT,
    "flooring_series" TEXT,
    "flooring_material" "FlooringMaterial",
    "flooring_wear_layer" TEXT,
    "flooring_thickness_mm" DECIMAL(65,30),
    "flooring_plank_length_in" DECIMAL(65,30),
    "flooring_plank_width_in" DECIMAL(65,30),
    "flooring_core_thickness_mm" DECIMAL(65,30),
    "flooring_finish" "FlooringFinish",
    "flooring_edge" "FlooringEdge",
    "flooring_installation" "FlooringInstallation",
    "flooring_underlayment" "FlooringUnderlayment",
    "flooring_underlayment_type" TEXT,
    "flooring_underlayment_mm" DECIMAL(65,30),
    "flooring_water_resistance" "FlooringWaterResistance",
    "flooring_waterproof" BOOLEAN,
    "flooring_warranty_residential_yr" INTEGER,
    "flooring_warranty_commercial_yr" INTEGER,
    "flooring_pieces_per_box" INTEGER,
    "flooring_box_coverage_sqft" DECIMAL(65,30),
    "flooring_low_stock_threshold" DECIMAL(65,30),
    "brand" TEXT,
    "collection" TEXT,
    "sku_prefix" TEXT,
    "available_stock" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cost" DECIMAL(65,30),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "display_name" TEXT,
    "image_url" TEXT,
    "sku_suffix" TEXT,
    "description" TEXT,
    "width" DECIMAL(65,30),
    "height" DECIMAL(65,30),
    "color" TEXT,
    "glass_type" TEXT,
    "glass_type_override" TEXT,
    "sliding_config_override" TEXT,
    "glass_coating_override" TEXT,
    "glass_thickness_mm_override" INTEGER,
    "glass_finish_override" TEXT,
    "screen_override" TEXT,
    "opening_type_override" TEXT,
    "screen_type" TEXT,
    "slide_direction" TEXT,
    "variant_type" TEXT,
    "thickness_mm" DECIMAL(65,30),
    "box_sqft" DECIMAL(65,30),
    "cost" DECIMAL(65,30),
    "price" DECIMAL(65,30),
    "reorder_level" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reorder_qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "is_stock_item" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_counters" (
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_order_counters_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "doc_type" "SalesDocType" NOT NULL DEFAULT 'SALES_ORDER',
    "project_name" TEXT,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "special_order" BOOLEAN NOT NULL DEFAULT false,
    "supplier_id" TEXT,
    "eta_date" TIMESTAMP(3),
    "special_order_status" TEXT,
    "supplier_notes" TEXT,
    "hide_prices" BOOLEAN NOT NULL DEFAULT false,
    "deposit_required" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(65,30),
    "tax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balance_due" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "payment_status" TEXT NOT NULL DEFAULT 'unpaid',
    "salesperson_name" TEXT,
    "commission_rate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "commission_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fulfillment_method" "SalesOrderFulfillmentMethod" NOT NULL DEFAULT 'PICKUP',
    "delivery_name" TEXT,
    "delivery_phone" TEXT,
    "delivery_address1" TEXT,
    "delivery_address2" TEXT,
    "delivery_city" TEXT,
    "delivery_state" TEXT,
    "delivery_zip" TEXT,
    "delivery_notes" TEXT,
    "pickup_notes" TEXT,
    "requested_delivery_at" TIMESTAMP(3),
    "order_date" TIMESTAMP(3),
    "reserved_applied_at" TIMESTAMP(3),
    "time_window" TEXT,
    "reserved_released_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_items" (
    "id" TEXT NOT NULL,
    "sales_order_id" TEXT NOT NULL,
    "product_id" TEXT,
    "variant_id" TEXT,
    "product_sku" TEXT,
    "product_title" TEXT,
    "sku_snapshot" TEXT,
    "title_snapshot" TEXT,
    "uom_snapshot" TEXT,
    "cost_snapshot" DECIMAL(65,30),
    "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "description" TEXT,
    "line_description" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit_price" DECIMAL(65,30) NOT NULL,
    "line_discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(65,30) NOT NULL,
    "fulfill_qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "is_special_order" BOOLEAN NOT NULL DEFAULT false,
    "special_order_status" TEXT,
    "linked_po_id" TEXT,
    "special_followup_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "order_date" TIMESTAMP(3) NOT NULL,
    "expected_arrival" TIMESTAMP(3),
    "total_cost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_payments" (
    "id" TEXT NOT NULL,
    "sales_order_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "method" "SalesPaymentMethod" NOT NULL,
    "type" "SalesPaymentType" NOT NULL DEFAULT 'FINAL',
    "status" "SalesPaymentStatus" NOT NULL DEFAULT 'POSTED',
    "reference_number" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_counters" (
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "sales_order_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(65,30),
    "tax_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "billing_address" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "default_tax_rate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "sku_snapshot" TEXT,
    "title_snapshot" TEXT,
    "description" TEXT,
    "uom_snapshot" TEXT,
    "unit_price" DECIMAL(65,30) NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL,
    "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(65,30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_fulfillments" (
    "id" TEXT NOT NULL,
    "sales_order_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "type" "SalesFulfillmentType" NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "scheduled_date" TIMESTAMP(3),
    "status" "SalesFulfillmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "time_window" TEXT,
    "driver_name" TEXT,
    "shipto_name" TEXT,
    "shipto_phone" TEXT,
    "shipto_address1" TEXT,
    "shipto_address2" TEXT,
    "shipto_city" TEXT,
    "shipto_state" TEXT,
    "shipto_zip" TEXT,
    "shipto_notes" TEXT,
    "marked_out_at" TIMESTAMP(3),
    "marked_done_at" TIMESTAMP(3),
    "inventory_deducted_at" TIMESTAMP(3),
    "inventory_deducted_by" TEXT,
    "pickup_contact" TEXT,
    "delivery_name" TEXT,
    "delivery_phone" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_order_fulfillments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_fulfillment_items" (
    "id" TEXT NOT NULL,
    "fulfillment_id" TEXT NOT NULL,
    "sales_order_item_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "title" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "ordered_qty" DECIMAL(65,30) NOT NULL,
    "fulfilled_qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_order_fulfillment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_outbound_queue" (
    "id" TEXT NOT NULL,
    "sales_order_id" TEXT NOT NULL,
    "fulfillment_id" TEXT,
    "type" "SalesFulfillmentType" NOT NULL,
    "status" "SalesFulfillmentStatus" NOT NULL,
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "address" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_outbound_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_stock" (
    "id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "on_hand" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "fulfillment_id" TEXT,
    "fulfillment_item_id" TEXT,
    "type" TEXT NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL,
    "unit" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "returns" (
    "id" TEXT NOT NULL,
    "sales_order_id" TEXT NOT NULL,
    "fulfillment_id" TEXT,
    "source_invoice_id" TEXT,
    "return_type" TEXT NOT NULL DEFAULT 'RETURN',
    "refund_method" TEXT,
    "status" "ReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "issue_store_credit" BOOLEAN NOT NULL DEFAULT false,
    "credit_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "fulfillment_item_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_credits" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "used_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "StoreCreditStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_credit_applications" (
    "id" TEXT NOT NULL,
    "store_credit_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_credit_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "after_sales_returns" (
    "id" TEXT NOT NULL,
    "return_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sales_order_id" TEXT,
    "invoice_id" TEXT,
    "type" "AfterSalesReturnType" NOT NULL DEFAULT 'RETURN',
    "status" "AfterSalesReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "refund_method" "AfterSalesRefundMethod" NOT NULL DEFAULT 'NO_REFUND',
    "refund_total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "pdf_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "after_sales_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "after_sales_return_items" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "line_item_id" TEXT,
    "variant_id" TEXT,
    "title" TEXT NOT NULL,
    "sku" TEXT,
    "qty_purchased" DECIMAL(65,30),
    "qty_return" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "condition" TEXT,
    "line_refund" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "after_sales_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "after_sales_return_events" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "status" "AfterSalesReturnStatus" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "after_sales_return_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_tickets" (
    "id" TEXT NOT NULL,
    "sales_order_id" TEXT NOT NULL,
    "fulfillment_id" TEXT,
    "ticket_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "scheduled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_order_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reorder_batch" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'Draft',

    CONSTRAINT "reorder_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reorder_batch_items" (
    "id" TEXT NOT NULL,
    "reorder_batch_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reorder_batch_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "description_templates" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "template_json" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "description_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_groupId_idx" ON "Product"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "product_category_templates_categoryId_key" ON "product_category_templates"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "product_category_templates_categoryKey_key" ON "product_category_templates"("categoryKey");

-- CreateIndex
CREATE INDEX "product_category_templates_categoryKey_idx" ON "product_category_templates"("categoryKey");

-- CreateIndex
CREATE INDEX "product_attributes_dictionary_attribute_value_idx" ON "product_attributes_dictionary"("attribute", "value");

-- CreateIndex
CREATE INDEX "product_attributes_dictionary_categoryId_idx" ON "product_attributes_dictionary"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_groups_name_key" ON "inventory_groups"("name");

-- CreateIndex
CREATE INDEX "inventory_groups_name_idx" ON "inventory_groups"("name");

-- CreateIndex
CREATE INDEX "Warehouse_name_idx" ON "Warehouse"("name");

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");

-- CreateIndex
CREATE INDEX "Supplier_category_idx" ON "Supplier"("category");

-- CreateIndex
CREATE INDEX "StockLog_productId_createdAt_idx" ON "StockLog"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "StockLog_warehouseId_createdAt_idx" ON "StockLog"("warehouseId", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");

-- CreateIndex
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "OrderActivity_orderId_createdAt_idx" ON "OrderActivity"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE INDEX "AfterSalesTicket_status_createdAt_idx" ON "AfterSalesTicket"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AfterSalesTicket_priority_createdAt_idx" ON "AfterSalesTicket"("priority", "createdAt");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_ticketId_createdAt_idx" ON "MaintenanceRecord"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_orderId_createdAt_idx" ON "Attachment"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_productId_createdAt_idx" ON "Attachment"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE INDEX "customer_notes_customer_id_created_at_idx" ON "customer_notes"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "product_variants_is_stock_item_idx" ON "product_variants"("is_stock_item");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_order_number_key" ON "sales_orders"("order_number");

-- CreateIndex
CREATE INDEX "sales_orders_customer_id_idx" ON "sales_orders"("customer_id");

-- CreateIndex
CREATE INDEX "sales_orders_customer_id_created_at_idx" ON "sales_orders"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "sales_orders_customer_id_status_idx" ON "sales_orders"("customer_id", "status");

-- CreateIndex
CREATE INDEX "sales_orders_supplier_id_idx" ON "sales_orders"("supplier_id");

-- CreateIndex
CREATE INDEX "sales_orders_eta_date_idx" ON "sales_orders"("eta_date");

-- CreateIndex
CREATE INDEX "sales_orders_created_at_idx" ON "sales_orders"("created_at");

-- CreateIndex
CREATE INDEX "sales_order_items_sales_order_id_idx" ON "sales_order_items"("sales_order_id");

-- CreateIndex
CREATE INDEX "sales_order_items_product_id_idx" ON "sales_order_items"("product_id");

-- CreateIndex
CREATE INDEX "sales_order_items_variant_id_idx" ON "sales_order_items"("variant_id");

-- CreateIndex
CREATE INDEX "sales_order_items_is_special_order_special_order_status_idx" ON "sales_order_items"("is_special_order", "special_order_status");

-- CreateIndex
CREATE INDEX "sales_order_items_linked_po_id_idx" ON "sales_order_items"("linked_po_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_po_number_key" ON "purchase_orders"("po_number");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_orders_status_expected_arrival_idx" ON "purchase_orders"("status", "expected_arrival");

-- CreateIndex
CREATE INDEX "sales_order_payments_sales_order_id_idx" ON "sales_order_payments"("sales_order_id");

-- CreateIndex
CREATE INDEX "sales_order_payments_status_sales_order_id_idx" ON "sales_order_payments"("status", "sales_order_id");

-- CreateIndex
CREATE INDEX "sales_order_payments_invoice_id_idx" ON "sales_order_payments"("invoice_id");

-- CreateIndex
CREATE INDEX "sales_order_payments_status_invoice_id_idx" ON "sales_order_payments"("status", "invoice_id");

-- CreateIndex
CREATE INDEX "sales_order_payments_received_at_idx" ON "sales_order_payments"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_sales_order_id_idx" ON "invoices"("sales_order_id");

-- CreateIndex
CREATE INDEX "invoices_customer_id_idx" ON "invoices"("customer_id");

-- CreateIndex
CREATE INDEX "invoices_issue_date_idx" ON "invoices"("issue_date");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_items_variant_id_idx" ON "invoice_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_order_fulfillments_sales_order_id_key" ON "sales_order_fulfillments"("sales_order_id");

-- CreateIndex
CREATE INDEX "sales_order_fulfillments_customer_id_idx" ON "sales_order_fulfillments"("customer_id");

-- CreateIndex
CREATE INDEX "sales_order_fulfillments_scheduled_date_idx" ON "sales_order_fulfillments"("scheduled_date");

-- CreateIndex
CREATE INDEX "sales_order_fulfillment_items_fulfillment_id_idx" ON "sales_order_fulfillment_items"("fulfillment_id");

-- CreateIndex
CREATE INDEX "sales_order_fulfillment_items_sales_order_item_id_idx" ON "sales_order_fulfillment_items"("sales_order_item_id");

-- CreateIndex
CREATE INDEX "sales_order_fulfillment_items_variant_id_idx" ON "sales_order_fulfillment_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_order_fulfillment_items_fulfillment_id_sales_order_it_key" ON "sales_order_fulfillment_items"("fulfillment_id", "sales_order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_outbound_queue_sales_order_id_key" ON "sales_outbound_queue"("sales_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_outbound_queue_fulfillment_id_key" ON "sales_outbound_queue"("fulfillment_id");

-- CreateIndex
CREATE INDEX "sales_outbound_queue_status_idx" ON "sales_outbound_queue"("status");

-- CreateIndex
CREATE INDEX "sales_outbound_queue_scheduled_date_idx" ON "sales_outbound_queue"("scheduled_date");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_stock_variant_id_key" ON "inventory_stock"("variant_id");

-- CreateIndex
CREATE INDEX "inventory_stock_reserved_idx" ON "inventory_stock"("reserved");

-- CreateIndex
CREATE INDEX "inventory_movements_variant_id_created_at_idx" ON "inventory_movements"("variant_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_fulfillment_id_idx" ON "inventory_movements"("fulfillment_id");

-- CreateIndex
CREATE INDEX "inventory_movements_fulfillment_item_id_idx" ON "inventory_movements"("fulfillment_item_id");

-- CreateIndex
CREATE INDEX "returns_sales_order_id_created_at_idx" ON "returns"("sales_order_id", "created_at");

-- CreateIndex
CREATE INDEX "returns_fulfillment_id_idx" ON "returns"("fulfillment_id");

-- CreateIndex
CREATE INDEX "returns_source_invoice_id_idx" ON "returns"("source_invoice_id");

-- CreateIndex
CREATE INDEX "return_items_return_id_idx" ON "return_items"("return_id");

-- CreateIndex
CREATE INDEX "return_items_fulfillment_item_id_idx" ON "return_items"("fulfillment_item_id");

-- CreateIndex
CREATE INDEX "return_items_variant_id_idx" ON "return_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_credits_return_id_key" ON "store_credits"("return_id");

-- CreateIndex
CREATE INDEX "store_credits_customer_id_created_at_idx" ON "store_credits"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "store_credits_status_idx" ON "store_credits"("status");

-- CreateIndex
CREATE INDEX "store_credit_applications_invoice_id_created_at_idx" ON "store_credit_applications"("invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "store_credit_applications_store_credit_id_created_at_idx" ON "store_credit_applications"("store_credit_id", "created_at");

-- CreateIndex
CREATE INDEX "store_credit_applications_payment_id_idx" ON "store_credit_applications"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "after_sales_returns_return_number_key" ON "after_sales_returns"("return_number");

-- CreateIndex
CREATE INDEX "after_sales_returns_customer_id_created_at_idx" ON "after_sales_returns"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "after_sales_returns_sales_order_id_idx" ON "after_sales_returns"("sales_order_id");

-- CreateIndex
CREATE INDEX "after_sales_returns_invoice_id_idx" ON "after_sales_returns"("invoice_id");

-- CreateIndex
CREATE INDEX "after_sales_returns_status_created_at_idx" ON "after_sales_returns"("status", "created_at");

-- CreateIndex
CREATE INDEX "after_sales_return_items_return_id_idx" ON "after_sales_return_items"("return_id");

-- CreateIndex
CREATE INDEX "after_sales_return_items_line_item_id_idx" ON "after_sales_return_items"("line_item_id");

-- CreateIndex
CREATE INDEX "after_sales_return_items_variant_id_idx" ON "after_sales_return_items"("variant_id");

-- CreateIndex
CREATE INDEX "after_sales_return_events_return_id_created_at_idx" ON "after_sales_return_events"("return_id", "created_at");

-- CreateIndex
CREATE INDEX "sales_order_tickets_sales_order_id_idx" ON "sales_order_tickets"("sales_order_id");

-- CreateIndex
CREATE INDEX "sales_order_tickets_ticket_type_status_idx" ON "sales_order_tickets"("ticket_type", "status");

-- CreateIndex
CREATE INDEX "reorder_batch_supplier_id_created_at_idx" ON "reorder_batch"("supplier_id", "created_at");

-- CreateIndex
CREATE INDEX "reorder_batch_items_reorder_batch_id_idx" ON "reorder_batch_items"("reorder_batch_id");

-- CreateIndex
CREATE INDEX "reorder_batch_items_product_id_idx" ON "reorder_batch_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "description_templates_category_key" ON "description_templates"("category");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "inventory_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLog" ADD CONSTRAINT "StockLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLog" ADD CONSTRAINT "StockLog_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLog" ADD CONSTRAINT "StockLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderActivity" ADD CONSTRAINT "OrderActivity_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSalesTicket" ADD CONSTRAINT "AfterSalesTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSalesTicket" ADD CONSTRAINT "AfterSalesTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "AfterSalesTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_linked_po_id_fkey" FOREIGN KEY ("linked_po_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_payments" ADD CONSTRAINT "sales_order_payments_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_payments" ADD CONSTRAINT "sales_order_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_fulfillments" ADD CONSTRAINT "sales_order_fulfillments_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_fulfillments" ADD CONSTRAINT "sales_order_fulfillments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_fulfillment_items" ADD CONSTRAINT "sales_order_fulfillment_items_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "sales_order_fulfillments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_fulfillment_items" ADD CONSTRAINT "sales_order_fulfillment_items_sales_order_item_id_fkey" FOREIGN KEY ("sales_order_item_id") REFERENCES "sales_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_fulfillment_items" ADD CONSTRAINT "sales_order_fulfillment_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_outbound_queue" ADD CONSTRAINT "sales_outbound_queue_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_outbound_queue" ADD CONSTRAINT "sales_outbound_queue_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "sales_order_fulfillments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "sales_order_fulfillments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_fulfillment_item_id_fkey" FOREIGN KEY ("fulfillment_item_id") REFERENCES "sales_order_fulfillment_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "sales_order_fulfillments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_source_invoice_id_fkey" FOREIGN KEY ("source_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_fulfillment_item_id_fkey" FOREIGN KEY ("fulfillment_item_id") REFERENCES "sales_order_fulfillment_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_credits" ADD CONSTRAINT "store_credits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_credits" ADD CONSTRAINT "store_credits_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_credit_applications" ADD CONSTRAINT "store_credit_applications_store_credit_id_fkey" FOREIGN KEY ("store_credit_id") REFERENCES "store_credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_credit_applications" ADD CONSTRAINT "store_credit_applications_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_credit_applications" ADD CONSTRAINT "store_credit_applications_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "sales_order_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "after_sales_returns" ADD CONSTRAINT "after_sales_returns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "after_sales_returns" ADD CONSTRAINT "after_sales_returns_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "after_sales_returns" ADD CONSTRAINT "after_sales_returns_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "after_sales_return_items" ADD CONSTRAINT "after_sales_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "after_sales_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "after_sales_return_items" ADD CONSTRAINT "after_sales_return_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "after_sales_return_events" ADD CONSTRAINT "after_sales_return_events_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "after_sales_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_tickets" ADD CONSTRAINT "sales_order_tickets_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_tickets" ADD CONSTRAINT "sales_order_tickets_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "sales_order_fulfillments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reorder_batch" ADD CONSTRAINT "reorder_batch_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reorder_batch_items" ADD CONSTRAINT "reorder_batch_items_reorder_batch_id_fkey" FOREIGN KEY ("reorder_batch_id") REFERENCES "reorder_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reorder_batch_items" ADD CONSTRAINT "reorder_batch_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
