export type SaleDocumentType = "SALES_ORDER" | "QUOTE";
export type SaleFulfillmentMethod = "PICKUP" | "DELIVERY";

export type SaleCustomer = {
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
  customerType: string | null;
  taxExempt: boolean;
  taxRate: number | null;
  notes?: string | null;
};

export type SaleProduct = {
  id: string;
  productId: string;
  name: string;
  title: string;
  sku: string;
  generatedDescription: string | null;
  specsLine?: string | null;
  variantDescription: string | null;
  defaultDescription: string | null;
  brand: string | null;
  collection: string | null;
  availableStock: string;
  unit: string | null;
  sellingUnit: "BOX" | "PIECE" | "SQFT";
  flooringBoxCoverageSqft: number | null;
  price: string;
  imageUrl: string | null;
  category: string | null;
};

export type SaleLine = SaleProduct & {
  quantity: string;
};

export type DeliverySnapshot = {
  contactName: string;
  contactPhone: string;
  jobSiteName: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zipCode: string;
  notes: string;
};
