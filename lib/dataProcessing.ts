import { NetSuiteItem, ProcessedOrder, OrderItem, OrderConfig } from './types';

/**
 * Extract SKU prefix (first 5 chars) if it matches DPT## pattern
 */
export function extractSKUPrefix(sku: string): string | null {
  const prefix = sku.substring(0, 5).toUpperCase();
  if (prefix.match(/^DPT\d{2}$/)) {
    return prefix;
  }
  return null;
}

/**
 * Extract cup size from SKU prefix (DPT10 -> 10oz, DPT16 -> 16oz, DPT26 -> 26oz)
 */
export function extractCupSize(skuPrefix: string | null): string | null {
  if (!skuPrefix) return null;
  const match = skuPrefix.match(/^DPT(\d{2})$/);
  if (match) {
    const size = parseInt(match[1]);
    if (size === 10 || size === 16 || size === 26) {
      return `${size}oz`;
    }
  }
  return null;
}

/**
 * Check if a string is a URL
 */
function isUrl(str: string | undefined): boolean {
  if (!str) return false;
  return str.startsWith('http://') || str.startsWith('https://');
}

/**
 * Process a single NetSuite item into an OrderItem
 */
export function processItem(item: NetSuiteItem): OrderItem {
  const sku = item.values.item[0]?.text || '';
  const skuPrefix = extractSKUPrefix(sku);
  const size = extractCupSize(skuPrefix);

  // formulatext contains the image URL, check if it's a URL
  const formulatext = item.values.formulatext || '';
  const isImageUrl = isUrl(formulatext);
  
  // Image URL priority: formulatext (if URL) > custcol_custom_image_url > custcol1 > custcol1_1
  const imageUrl = isImageUrl 
    ? formulatext 
    : (item.values.custcol_custom_image_url || item.values.custcol1 || item.values.custcol1_1);
  
  // Description: use formulatext_1 if available, otherwise use formulatext if it's not a URL
  const description = item.values.formulatext_1 || (isImageUrl ? '' : formulatext);

  const pickLocation = item.values['item.custitem_pir_pick_location'];
  
  // Debug: log pick location for items that have it
  if (pickLocation && pickLocation.trim()) {
    console.debug('Pick location found:', pickLocation, 'for item:', sku);
  }

  return {
    sku,
    skuPrefix,
    size,
    quantity: parseInt(item.values.quantity) || 1,
    color: item.values['item.custitem_item_color'],
    imageUrl,
    barcode: item.values.custcol_customization_barcode,
    description,
    pickLocation: pickLocation?.trim() || undefined,
  };
}

/**
 * Check if an item is a Kit
 */
function isKit(item: NetSuiteItem): boolean {
  return item.values['item.type']?.[0]?.value === 'Kit';
}

/**
 * Get base SKU (remove -PERS suffix if present)
 */
function getBaseSKU(sku: string): string {
  return sku.replace(/-PERS$/, '');
}

/**
 * Filter out duplicate inventory items that follow Kit items
 * NetSuite sends Kit items first, then the inventory items that make up the kit
 * We want to keep only the Kit items and remove the duplicate inventory items
 */
function filterDuplicateKitItems(orderItems: NetSuiteItem[]): NetSuiteItem[] {
  const filtered: NetSuiteItem[] = [];
  const kitBaseSKUs = new Set<string>();
  
  // First pass: identify all Kit items and their base SKUs
  for (const item of orderItems) {
    if (isKit(item)) {
      const sku = item.values.item[0]?.text || '';
      const baseSKU = getBaseSKU(sku);
      kitBaseSKUs.add(baseSKU);
    }
  }
  
  // Second pass: keep Kit items, but skip inventory items that match a Kit's base SKU
  for (const item of orderItems) {
    if (isKit(item)) {
      // Always keep Kit items
      filtered.push(item);
    } else {
      // For non-Kit items, check if they match a Kit's base SKU
      const sku = item.values.item[0]?.text || '';
      const baseSKU = getBaseSKU(sku);
      
      // Only keep if it doesn't match any Kit's base SKU
      if (!kitBaseSKUs.has(baseSKU)) {
        filtered.push(item);
      }
      // Otherwise, skip it (it's a duplicate inventory item from a Kit)
    }
  }
  
  return filtered;
}

/**
 * Group items by tranid and create ProcessedOrder objects
 */
export function processOrders(items: NetSuiteItem[], orderConfig: OrderConfig): ProcessedOrder[] {
  // Group by tranid
  const orderMap = new Map<string, NetSuiteItem[]>();
  
  for (const item of items) {
    const tranid = item.values.tranid;
    if (!orderMap.has(tranid)) {
      orderMap.set(tranid, []);
    }
    orderMap.get(tranid)!.push(item);
  }

  // Process each order
  const processedOrders: ProcessedOrder[] = [];

  for (const [tranid, orderItems] of orderMap.entries()) {
    // Filter out duplicate inventory items that follow Kit items
    const filteredItems = filterDuplicateKitItems(orderItems);
    
    const firstItem = filteredItems[0];
    const processedItems = filteredItems.map(processItem);

    // Get cup sizes present in this order
    const cupSizes = new Set<string>();
    for (const item of processedItems) {
      if (item.size) {
        cupSizes.add(item.size);
      }
    }

    // Determine if personalized (check all items)
    const personalized = orderItems.some(item => item.values.custbody_pir_pers_order === true);

    // Match box size
    const boxSize = matchBoxSize(processedItems, orderConfig);

    processedOrders.push({
      tranid,
      orderNumber: firstItem.values['createdFrom.otherrefnum_1'] || firstItem.values['createdFrom.tranid'],
      // Prefer explicit shop order date if available, fall back to record creation date
      datecreated: firstItem.values['createdFrom.custbody_pir_shop_order_date'] || firstItem.values.datecreated,
      shipaddress: firstItem.values.shipaddress,
      personalized,
      items: processedItems,
      cupSizes,
      boxSize,
      shipmethod: firstItem.values.shipmethod?.[0]?.text,
      poNumber: firstItem.values['createdFrom.otherrefnum'],
      memo: firstItem.values['createdFrom.memo'] || firstItem.values['createdFrom.custbodypir_sales_order_warehouse_note'],
      shipstationOrderId: firstItem.values.custbody_pir_shipstation_ordid,
      customArtworkUrl: firstItem.values['createdFrom.custbody_pir_mockup_url_sales_order'],
    });
  }

  return processedOrders;
}

/**
 * Match order items to a box size configuration
 * Returns the box size key (singles, 4pack, 5pack, 10pack) or null
 */
function matchBoxSize(items: OrderItem[], orderConfig: OrderConfig): string | null {
  // Get all cup SKU prefixes (only cups, ignore non-cup items)
  const cupPrefixes: string[] = [];
  for (const item of items) {
    if (item.skuPrefix) {
      // Add the prefix for each quantity
      for (let i = 0; i < item.quantity; i++) {
        cupPrefixes.push(item.skuPrefix);
      }
    }
  }

  if (cupPrefixes.length === 0) {
    return null; // No cups in this order
  }

  // Check for singles first (exactly 1 cup item)
  if (cupPrefixes.length === 1) {
    return 'singles';
  }

  // Sort prefixes for consistent comparison
  cupPrefixes.sort();

  // Check each box size configuration
  for (const [boxSizeKey, config] of Object.entries(orderConfig.packSizes)) {
    for (const combination of config.combinations) {
      // Sort combination for comparison
      const sortedCombination = [...combination].sort();
      
      // Check if this order's cup prefixes match this combination exactly
      if (arraysMatch(cupPrefixes, sortedCombination)) {
        return boxSizeKey;
      }
    }
  }

  return null; // No match found
}

/**
 * Check if two arrays match exactly (same length and elements)
 */
function arraysMatch(arr1: string[], arr2: string[]): boolean {
  if (arr1.length !== arr2.length) return false;
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }
  return true;
}

/**
 * Filter orders based on criteria
 */
export function filterOrders(
  orders: ProcessedOrder[],
  filters: {
    personalized: boolean | null; // null = show all
    cupSizes: string[]; // Selected cup sizes (empty = all sizes)
    boxSize: string | null; // Selected box size (null = all sizes)
    dateFrom: Date | null;
    dateTo: Date | null;
    printedOnly: boolean | null; // null = show all, true = printed only, false = not printed only
    printedOrders: Set<string>; // Set of tranids that have been printed
  }
): ProcessedOrder[] {
  return orders.filter(order => {
    // Personalized filter
    if (filters.personalized !== null) {
      if (order.personalized !== filters.personalized) {
        return false;
      }
    }

    // Cup size filter
    if (filters.cupSizes.length > 0) {
      // Get all cup sizes in this order
      const orderCupSizes = Array.from(order.cupSizes);
      
      // Order must have ONLY the selected sizes (no other cup sizes)
      if (orderCupSizes.length !== filters.cupSizes.length) {
        return false;
      }
      
      // All selected sizes must be present
      for (const selectedSize of filters.cupSizes) {
        if (!orderCupSizes.includes(selectedSize)) {
          return false;
        }
      }
    }

    // Box size filter
    if (filters.boxSize !== null) {
      if (order.boxSize !== filters.boxSize) {
        return false;
      }
    }

    // Date filter - inclusive range (orders on dateFrom and dateTo should be included)
    if (filters.dateFrom || filters.dateTo) {
      const orderDate = parseDate(order.datecreated);
      if (!orderDate) return false;
      
      // Normalize all dates to start of day (00:00:00) for comparison
      // This ensures we're comparing just the date part, not the time
      const normalizeDate = (date: Date): Date => {
        const normalized = new Date(date);
        normalized.setHours(0, 0, 0, 0);
        normalized.setMilliseconds(0);
        return normalized;
      };
      
      const orderDateOnly = normalizeDate(orderDate);
      
      if (filters.dateFrom) {
        const dateFromOnly = normalizeDate(filters.dateFrom);
        // Include orders on or after dateFrom (>=)
        // Using < means exclude if order is BEFORE dateFrom, which is correct
        if (orderDateOnly < dateFromOnly) {
          return false;
        }
      }
      if (filters.dateTo) {
        const dateToOnly = normalizeDate(filters.dateTo);
        // Include orders on or before dateTo (<=)
        // Using > means exclude if order is AFTER dateTo, which is correct
        if (orderDateOnly > dateToOnly) {
          return false;
        }
      }
    }

    // Printed filter
    if (filters.printedOnly !== null) {
      const isPrinted = filters.printedOrders.has(order.tranid);
      if (filters.printedOnly && !isPrinted) {
        return false;
      }
      if (!filters.printedOnly && isPrinted) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Parse date string from NetSuite format.
 * Supports both:
 *  - "MM/DD/YYYY HH:MM am/pm" (standard NetSuite datetime)
 *  - "MM/DD/YYYY" (shop order date without time)
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  try {
    const parts = dateStr.trim().split(' ');
    const datePart = parts[0]; // "MM/DD/YYYY"
    const [month, day, year] = datePart.split('/').map(Number);

    if (!month || !day || !year) return null;

    // If we only have a date (shop order date), treat it as midnight
    if (parts.length < 2) {
      return new Date(year, month - 1, day, 0, 0);
    }

    // Full datetime: "HH:MM am/pm"
    const timePart = parts.slice(1).join(' ');
    const timeMatch = timePart.match(/(\d+):(\d+)\s*(am|pm)/i);
    if (!timeMatch) {
      // Fallback: just return date-only if time can't be parsed
      return new Date(year, month - 1, day, 0, 0);
    }

    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const ampm = timeMatch[3].toLowerCase();

    if (ampm === 'pm' && hours !== 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    return new Date(year, month - 1, day, hours, minutes);
  } catch {
    return null;
  }
}

