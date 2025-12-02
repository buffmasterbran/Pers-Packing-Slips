const PRINTED_ORDERS_KEY = 'packing-slips-printed-orders';

/**
 * Get set of printed order tranids from localStorage
 */
export function getPrintedOrders(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  
  try {
    const stored = localStorage.getItem(PRINTED_ORDERS_KEY);
    if (stored) {
      const array = JSON.parse(stored) as string[];
      return new Set(array);
    }
  } catch (error) {
    console.error('Error reading printed orders from localStorage:', error);
  }
  
  return new Set();
}

/**
 * Mark orders as printed in localStorage
 */
export function markOrdersAsPrinted(tranids: string[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    const existing = getPrintedOrders();
    for (const tranid of tranids) {
      existing.add(tranid);
    }
    localStorage.setItem(PRINTED_ORDERS_KEY, JSON.stringify(Array.from(existing)));
  } catch (error) {
    console.error('Error saving printed orders to localStorage:', error);
  }
}

/**
 * Clear all printed orders from localStorage
 */
export function clearPrintedOrders(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(PRINTED_ORDERS_KEY);
  } catch (error) {
    console.error('Error clearing printed orders from localStorage:', error);
  }
}

