export interface NetSuiteItem {
  recordType: string;
  id: string;
  values: {
    datecreated: string;
    "createdFrom.tranid": string;
    "createdFrom.custbody_pir_shop_order_date"?: string;
    "createdFrom.otherrefnum"?: string;
    tranid: string;
    item: Array<{ value: string; text: string }>;
    "item.custitem_item_color"?: string;
    "item.custitem_item_size"?: string;
    "item.custitem_pir_pick_location"?: string;
    custcol_customization_barcode?: string;
    custcol_custom_image_url?: string;
    custcol1?: string;
    name: Array<{ value: string; text: string }>;
    quantity: string;
    shipaddress: string;
    custbody_pir_pers_order: boolean;
    shipmethod: Array<{ value: string; text: string }>;
    "createdFrom.otherrefnum_1"?: string;
    formulatext?: string;
    formulatext_1?: string;
    custcol1_1?: string;
    custbody_fulfilled_by?: string;
    custbody_pir_shipstation_ordid?: string;
    "createdFrom.custbody_pir_mockup_url_sales_order"?: string;
    "item.type"?: Array<{ value: string; text: string }>;
    "createdFrom.memo"?: string;
    "createdFrom.custbodypir_sales_order_warehouse_note"?: string;
  };
}

export interface OrderItem {
  sku: string;
  skuPrefix: string | null; // First 5 chars if matches DPT## pattern
  size: string | null; // 10oz, 16oz, 26oz, or null
  quantity: number;
  color?: string;
  imageUrl?: string;
  barcode?: string;
  description?: string;
  pickLocation?: string; // item.custitem_pir_pick_location
}

export interface ProcessedOrder {
  tranid: string;
  orderNumber: string; // createdFrom.otherrefnum_1 (Shopify order #) or createdFrom.tranid (fallback)
  datecreated: string;
  shipaddress: string;
  personalized: boolean;
  items: OrderItem[];
  cupSizes: Set<string>; // Set of sizes in this order (10oz, 16oz, 26oz)
  boxSize: string | null; // Matched box size (4pack, 5pack, 10pack) or null
  shipmethod?: string;
  poNumber?: string;
  memo?: string;
  shipstationOrderId?: string;
  customArtworkUrl?: string; // custbody_pir_mockup_url_sales_order
  shippingZone?: string; // Shipping zone ID (local, regional, national, distant)
  shippingZoneName?: string; // Human-readable zone name
  shippingDistance?: number | null; // Distance from Asheville in miles
}

export interface BoxSizeConfig {
  name: string;
  maxItems: number;
  combinations: string[][];
}

export interface OrderConfig {
  packSizes: {
    [key: string]: BoxSizeConfig;
  };
}

