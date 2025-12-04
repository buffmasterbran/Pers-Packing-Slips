/**
 * Get set of printed order tranids from database via API
 */
export async function getPrintedOrders(): Promise<Set<string>> {
  if (typeof window === 'undefined') return new Set();
  
  try {
    const response = await fetch('/api/printed', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Failed to fetch printed orders');
    }
    const data = await response.json();
    return new Set(data.printedOrders || []);
  } catch (error) {
    console.error('Error reading printed orders from database:', error);
    return new Set();
  }
}

/**
 * Mark orders as printed in database via API
 */
export async function markOrdersAsPrinted(tranids: string[]): Promise<void> {
  if (typeof window === 'undefined') return;
  if (tranids.length === 0) return;
  
  try {
    const response = await fetch('/api/printed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tranids }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to mark orders as printed');
    }
  } catch (error) {
    console.error('Error saving printed orders to database:', error);
  }
}

/**
 * Clear all printed orders from database via API
 */
export async function clearPrintedOrders(): Promise<void> {
  if (typeof window === 'undefined') return;
  
  try {
    const response = await fetch('/api/printed', {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error('Failed to clear printed orders');
    }
  } catch (error) {
    console.error('Error clearing printed orders from database:', error);
  }
}

