import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import { ProcessedOrder, OrderItem } from './types';

/**
 * Generate a multi-page PDF with packing slips for the given orders
 * Singles orders are grouped 2 per page, other orders get 1 per page
 */
export async function generatePackingSlipsPDF(orders: ProcessedOrder[]): Promise<void> {
  if (!orders || orders.length === 0) {
    throw new Error('No orders provided');
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter',
  });

  // Separate singles / small packs from other orders
  const singlesOrders: ProcessedOrder[] = [];
  const otherOrders: ProcessedOrder[] = [];
  
  for (const order of orders) {
    // Treat Singles and 2/4 Packs (boxSize '4pack') as "small" orders: 2 per page
    if (order.boxSize === 'singles' || order.boxSize === '4pack') {
      singlesOrders.push(order);
    } else {
      otherOrders.push(order);
    }
  }

  let pageAdded = false;

  // Process singles orders (2 per page)
  if (singlesOrders.length > 0) {
    for (let i = 0; i < singlesOrders.length; i += 2) {
      if (pageAdded) {
        doc.addPage();
      }
      pageAdded = true;

      const order1 = singlesOrders[i];
      if (!order1) {
        console.error('Missing order1 at index', i);
        continue;
      }

      const order2 = singlesOrders[i + 1]; // May be undefined if odd number

      if (order2) {
        // Two orders side by side
        try {
          await generateTwoSinglesPage(doc, order1, order2);
        } catch (error) {
          console.error('Error generating two singles page:', error);
          throw error;
        }
      } else {
        // Last single order alone (or only one single)
        try {
          await generatePackingSlipPage(doc, order1);
        } catch (error) {
          console.error('Error generating single packing slip page:', error);
          throw error;
        }
      }
    }
  }

  // Process other orders (1 per page)
  for (const order of otherOrders) {
    if (pageAdded) {
      doc.addPage();
    }
    pageAdded = true;
    
    try {
      await generatePackingSlipPage(doc, order);
    } catch (error) {
      console.error('Error generating packing slip page:', error);
      throw error;
    }
  }

  // Open PDF in new tab instead of downloading
  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, '_blank');
  // Clean up the object URL after a short delay (browser will handle it when tab closes)
  setTimeout(() => URL.revokeObjectURL(pdfUrl), 100);
}

/**
 * Generate a single packing slip page
 */
async function generatePackingSlipPage(doc: jsPDF, order: ProcessedOrder): Promise<void> {
  const pageWidth = 8.5;
  const pageHeight = 11;
  const margin = 0.5;
  const contentWidth = pageWidth - (margin * 2);

  // Header section (3 columns: Logo+Ship To, Custom Artwork, Order Details)
  const headerHeight = await drawHeader(doc, order, margin, margin, contentWidth);
  
  // Items table
  const itemsStartY = headerHeight + 0.2;
  await drawItemsTable(doc, order, margin, itemsStartY, contentWidth, pageHeight - margin - 0.5);
  
  // Footer with barcode
  await drawFooter(doc, order, margin, pageHeight - 0.3, contentWidth);
}

/**
 * Generate a page with two singles orders stacked top/bottom
 */
async function generateTwoSinglesPage(doc: jsPDF, order1: ProcessedOrder, order2: ProcessedOrder): Promise<void> {
  if (!order1 || !order2) {
    throw new Error('Both orders are required for two singles page');
  }

  const pageWidth = 8.5;
  const pageHeight = 11;
  const margin = 0.5;
  const topMargin = margin; // Top margin for first order
  const bottomOrderTopPadding = 0.3; // Extra space at top of bottom order after cutting
  const separatorLineWidth = 0.01; // Thick line for cutting guide
  const separatorGap = 0.3; // Space around separator line
  const contentWidth = pageWidth - (margin * 2);
  
  // Calculate heights: leave space for separator and padding
  const availableHeight = pageHeight - topMargin - margin - separatorGap - bottomOrderTopPadding;
  const singleOrderHeight = availableHeight / 2;

  // Top order
  const topY = topMargin;
  const topHeaderHeight = await drawHeader(doc, order1, margin, topY, contentWidth);
  const topItemsStartY = topHeaderHeight + 0.2;
  const topMaxY = topY + singleOrderHeight;
  await drawItemsTable(doc, order1, margin, topItemsStartY, contentWidth, topMaxY - 0.3);
  await drawFooter(doc, order1, margin, topMaxY - 0.1, contentWidth);

  // Draw separator line between orders (for easy cutting)
  // Position it with space above and below to avoid overlapping text
  const separatorY = topMaxY + (separatorGap / 2);
  doc.setLineWidth(separatorLineWidth);
  doc.setDrawColor(0, 0, 0); // Black line
  doc.line(margin, separatorY, margin + contentWidth, separatorY);
  
  // Add dashed line indicator for cutting (optional visual guide)
  doc.setLineDashPattern([0.05, 0.05], 0);
  doc.setLineWidth(0.005);
  doc.setDrawColor(150, 150, 150); // Light gray dashed line
  doc.line(margin, separatorY, margin + contentWidth, separatorY);
  doc.setLineDashPattern([], 0); // Reset to solid line

  // Bottom order - add padding at top so when cut, there's space at the top of the paper
  const bottomY = separatorY + (separatorGap / 2) + bottomOrderTopPadding;
  const bottomHeaderHeight = await drawHeader(doc, order2, margin, bottomY, contentWidth);
  const bottomItemsStartY = bottomHeaderHeight + 0.2;
  const bottomMaxY = pageHeight - margin;
  await drawItemsTable(doc, order2, margin, bottomItemsStartY, contentWidth, bottomMaxY - 0.5);
  await drawFooter(doc, order2, margin, bottomMaxY - 0.3, contentWidth);
}

/**
 * Draw header with 3-column layout: Logo+Ship To (left), Custom Artwork (middle), Order Details (right)
 */
async function drawHeader(doc: jsPDF, order: ProcessedOrder, x: number, y: number, width: number): Promise<number> {
  const startY = y;
  const isNarrow = width < 3.5; // Singles layout is narrower
  const col1Width = width * 0.35; // Left column (Logo + Ship To)
  const col2Width = width * 0.30; // Middle column (Custom Artwork)
  const col3Width = width * 0.35; // Right column (Order Details)
  
  let maxY = startY;

  // Left Column: Ship To address
  let currentY = startY + 0.1;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isNarrow ? 8 : 10);
  doc.text('SHIP TO', x, currentY);
  currentY += 0.15;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isNarrow ? 7 : 9);
  const addressLines = order.shipaddress.split('\r\n').filter(line => line.trim());
  for (const line of addressLines) {
    doc.text(line, x, currentY, { maxWidth: col1Width - 0.1 });
    currentY += 0.15;
  }
  maxY = Math.max(maxY, currentY);

  // Middle Column: Custom Artwork (if available)
  if (order.customArtworkUrl) {
    try {
      currentY = startY + 0.1;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isNarrow ? 7 : 9);
      doc.text('Custom Artwork', x + col1Width + col2Width / 2, currentY, { align: 'center' });
      currentY += 0.15;
      
      // Load and optimize custom artwork image (scale for narrow layout)
      const artworkData = await loadImageAsDataUrl(order.customArtworkUrl, isNarrow ? 200 : 400, isNarrow ? 200 : 400);
      if (artworkData) {
        const maxWidth = isNarrow ? 0.85 : 1.7;
        const maxHeight = isNarrow ? 0.65 : 1.3;
        // Calculate aspect ratio preserving dimensions
        const aspectRatio = artworkData.width / artworkData.height;
        let imgWidth = maxWidth;
        let imgHeight = maxWidth / aspectRatio;
        if (imgHeight > maxHeight) {
          imgHeight = maxHeight;
          imgWidth = maxHeight * aspectRatio;
        }
        const format = artworkData.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(artworkData.dataUrl, format, x + col1Width + (col2Width - imgWidth) / 2, currentY, imgWidth, imgHeight);
        maxY = Math.max(maxY, currentY + imgHeight);
      }
    } catch (error) {
      console.warn('Failed to load custom artwork:', order.customArtworkUrl, error);
    }
  }

  // Right Column: Order Details
  currentY = startY;
  
  // Title "PACKING SLIP"
  doc.setFontSize(isNarrow ? 14 : 20);
  doc.setFont('helvetica', 'bold');
  doc.text('PACKING SLIP', x + col1Width + col2Width + col3Width - 0.1, currentY, { align: 'right' });
  currentY += 0.3;

  // Order details with borders
  doc.setFontSize(isNarrow ? 7 : 9);

  // Display order date instead of ship method in header details
  const orderDateDisplay = order.datecreated
    ? order.datecreated.split(' ')[0] // Show just the date portion (MM/DD/YYYY)
    : '';

  const details = [
    { label: 'Order Number', value: order.orderNumber },
    { label: 'Item Fulfillment', value: order.tranid },
    { label: 'PO Number', value: order.poNumber || '' },
    { label: 'Order Notes', value: order.memo || '' },
    { label: 'Order Date', value: orderDateDisplay },
  ];

  const detailX = x + col1Width + col2Width;
  const detailWidth = col3Width - 0.1;
  
  for (const detail of details) {
    doc.setFont('helvetica', 'bold');
    doc.text(detail.label + ':', detailX, currentY);
    doc.setFont('helvetica', 'normal');
    const value = detail.value || 'N/A';
    doc.text(value, detailX + detailWidth, currentY, { align: 'right', maxWidth: detailWidth * 0.6 });
    
    // Draw border line
    doc.setLineWidth(0.005);
    doc.line(detailX, currentY + 0.05, detailX + detailWidth, currentY + 0.05);
    
    currentY += 0.2;
  }
  maxY = Math.max(maxY, currentY);

  // Draw separator line
  maxY += 0.1;
  doc.setLineWidth(0.01);
  doc.line(x, maxY, x + width, maxY);

  return maxY;
}

/**
 * Add imgix parameters to resize and compress images
 */
function optimizeImageUrl(url: string, maxWidth: number = 300, maxHeight: number = 300): string {
  if (url.startsWith('data:')) {
    return url; // Already a data URL, return as-is
  }

  // Check if it's an imgix URL
  if (url.includes('imgix.net')) {
    // Check if URL already has query parameters
    const hasParams = url.includes('?');
    const separator = hasParams ? '&' : '?';
    return `${url}${separator}w=${maxWidth}&h=${maxHeight}&auto=compress,format`;
  }

  // For non-imgix URLs, return as-is (could add other optimization later)
  return url;
}

/**
 * Load an image from URL and convert to data URL, returning both the data URL and dimensions
 */
async function loadImageAsDataUrl(url: string, maxWidth: number = 300, maxHeight: number = 300): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    // If it's already a data URL, load it to get dimensions
    if (url.startsWith('data:')) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          resolve({ dataUrl: url, width: img.width, height: img.height });
        };
        img.onerror = reject;
        img.src = url;
      });
    }

    // Optimize imgix URLs with resize/compress parameters
    const optimizedUrl = optimizeImageUrl(url, maxWidth, maxHeight);

    // Fetch the image
    const response = await fetch(optimizedUrl, { mode: 'cors' });
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const blob = await response.blob();
    
    // Convert blob to data URL and get dimensions
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          resolve({ dataUrl, width: img.width, height: img.height });
        };
        img.onerror = reject;
        img.src = dataUrl;
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Error loading image:', error);
    return null;
  }
}

/**
 * Generate barcode using jsbarcode (works in browser)
 * Generates at high resolution (300 DPI equivalent) for crisp printing
 * NetSuite generates barcodes at print resolution, so we match that quality
 * @param value - The barcode value to encode
 * @param targetWidthInches - Target width in inches (for proper aspect ratio)
 * @param targetHeightInches - Target height in inches (for proper aspect ratio)
 */
async function generateBarcodeAsync(
  value: string, 
  targetWidthInches: number = 1.99, 
  targetHeightInches: number = 0.46
): Promise<string | null> {
  if (!value) return null;
  
  try {
    // Generate at high resolution for print quality (300 DPI equivalent)
    // At 300 DPI, 1 inch = 300 pixels
    const scaleFactor = 3; // 3x resolution for crisp printing (matches 300 DPI)
    const targetWidthPx = targetWidthInches * 300; // 300 DPI base
    const targetHeightPx = targetHeightInches * 300; // 300 DPI base
    const highResWidth = targetWidthPx * scaleFactor;
    const highResHeight = targetHeightPx * scaleFactor;
    
    // Create a temporary canvas with explicit high-resolution dimensions
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(highResWidth);
    canvas.height = Math.ceil(highResHeight);
    
    // Generate barcode at high resolution
    // Calculate bar width to maintain proper barcode density
    // CODE128 bar width of 2 is standard, scale for high res
    const barWidth = 2 * scaleFactor;
    const barcodeHeight = highResHeight;
    
    JsBarcode(canvas, value, {
      format: 'CODE128',
      width: barWidth,
      height: barcodeHeight,
      displayValue: true,
      fontSize: 12 * scaleFactor, // Scale font for readability at high res
    });
    
    // Return as PNG (lossless) for maximum quality
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.warn('Failed to generate barcode:', error);
    return null;
  }
}

async function drawItemsTable(
  doc: jsPDF,
  order: ProcessedOrder,
  x: number,
  y: number,
  width: number,
  maxY: number
): Promise<number> {
  let currentY = y;
  const isNarrow = width < 3.5; // Singles layout is narrower

  // Table header - better column width distribution
  doc.setFontSize(isNarrow ? 6 : 8);
  doc.setFont('helvetica', 'bold');
  
  // Column widths: Image, Item, BARCODE, BIN, COLOR, SIZE, QTY
  // Scale column widths for narrow layout
  const baseColWidths = [0.5, 2.2, 2.0, 0.7, 1.0, 0.6, 0.5];
  const totalBaseWidth = baseColWidths.reduce((a, b) => a + b, 0);
  const scaleFactor = width / totalBaseWidth;
  const colWidths = baseColWidths.map(w => w * scaleFactor);
  
  const headers = ['', 'Item', 'BARCODE', 'BIN', 'COLOR', 'SIZE', 'QTY'];
  const headerAlignments: Array<'left' | 'center' | 'right'> = ['left', 'left', 'center', 'center', 'center', 'center', 'right'];
  
  let xPos = x;
  for (let i = 0; i < headers.length; i++) {
    const align = headerAlignments[i];
    if (align === 'center') {
      doc.text(headers[i], xPos + colWidths[i] / 2, currentY, { align: 'center' });
    } else if (align === 'right') {
      doc.text(headers[i], xPos + colWidths[i], currentY, { align: 'right' });
    } else {
      doc.text(headers[i], xPos, currentY, { align: 'left' });
    }
    xPos += colWidths[i];
  }
  
  currentY += 0.12;
  doc.setLineWidth(0.01);
  doc.line(x, currentY, x + width, currentY);
  currentY += 0.12;

  // Table rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isNarrow ? 6 : 8);
  const rowHeight = isNarrow ? 0.4 : 0.5; // Smaller row height for narrow layout

  for (const item of order.items) {
    // Check if we need a new page
    if (currentY + rowHeight > maxY) {
      doc.addPage();
      currentY = 0.5;
      // Redraw header on new page
      const headerHeight = await drawHeader(doc, order, x, currentY, width);
      currentY = headerHeight + 0.2;
      // Redraw table header
      xPos = x;
      for (let i = 0; i < headers.length; i++) {
        doc.setFont('helvetica', 'bold');
        const align = headerAlignments[i];
        if (align === 'center') {
          doc.text(headers[i], xPos + colWidths[i] / 2, currentY, { align: 'center' });
        } else if (align === 'right') {
          doc.text(headers[i], xPos + colWidths[i], currentY, { align: 'right' });
        } else {
          doc.text(headers[i], xPos, currentY, { align: 'left' });
        }
        xPos += colWidths[i];
      }
      currentY += 0.12;
      doc.setLineWidth(0.01);
      doc.line(x, currentY, x + width, currentY);
      currentY += 0.12;
      doc.setFont('helvetica', 'normal');
    }

    const rowStartY = currentY;
    xPos = x;
    
    // Image column (if available) - center vertically in row
    if (item.imageUrl) {
      try {
        // Load and optimize item image (larger size to use available space)
        const imgData = await loadImageAsDataUrl(item.imageUrl, isNarrow ? 150 : 300, isNarrow ? 150 : 300);
        if (imgData) {
          const maxWidth = isNarrow ? 0.3 : 0.5;
          const maxHeight = isNarrow ? 0.25 : 0.45;
          // Calculate aspect ratio preserving dimensions
          const aspectRatio = imgData.width / imgData.height;
          let imgWidth = maxWidth;
          let imgHeight = maxWidth / aspectRatio;
          if (imgHeight > maxHeight) {
            imgHeight = maxHeight;
            imgWidth = maxHeight * aspectRatio;
          }
          const imgY = rowStartY + (rowHeight - imgHeight) / 2; // Center vertically
          // Determine image format from data URL or URL extension
          const format = imgData.dataUrl.startsWith('data:image/png') ? 'PNG' : 
                        imgData.dataUrl.startsWith('data:image/jpeg') ? 'JPEG' :
                        item.imageUrl.toLowerCase().includes('.png') ? 'PNG' : 'JPEG';
          doc.addImage(imgData.dataUrl, format, xPos + 0.05, imgY, imgWidth, imgHeight);
        }
      } catch (error) {
        console.warn('Failed to load image:', item.imageUrl, error);
      }
    }
    xPos += colWidths[0];
    
    // Item name and description - left aligned
    const itemTextY = rowStartY + (isNarrow ? 0.1 : 0.15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isNarrow ? 6 : 8);
    doc.text(item.sku, xPos, itemTextY, { maxWidth: colWidths[1] - 0.1 });
    if (item.description) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(isNarrow ? 5 : 7);
      doc.text(item.description, xPos, itemTextY + (isNarrow ? 0.08 : 0.12), { maxWidth: colWidths[1] - 0.1 });
    }
    xPos += colWidths[1];
    
    // Barcode column - center aligned
    if (item.barcode) {
      try {
        const barcodeWidth = isNarrow ? 0.99 : 1.99; // Increased by additional 15% for better scannability
        const barcodeHeight = isNarrow ? 0.23 : 0.46; // Increased by 15% for better scannability
        // Generate barcode at target size for proper aspect ratio
        const barcodeDataUrl = await generateBarcodeAsync(item.barcode, barcodeWidth, barcodeHeight);
        if (barcodeDataUrl) {
          const barcodeX = xPos + (colWidths[2] - barcodeWidth) / 2; // Center horizontally
          const barcodeY = rowStartY + (rowHeight - barcodeHeight) / 2; // Center vertically
          doc.addImage(barcodeDataUrl, 'PNG', barcodeX, barcodeY, barcodeWidth, barcodeHeight);
        } else {
          // Fallback to text if barcode generation fails
          doc.text(item.barcode, xPos + colWidths[2] / 2, rowStartY + (isNarrow ? 0.1 : 0.2), { align: 'center' });
        }
      } catch (error) {
        console.warn('Failed to generate barcode:', error);
        doc.text(item.barcode, xPos + colWidths[2] / 2, rowStartY + (isNarrow ? 0.1 : 0.2), { align: 'center' });
      }
    }
    xPos += colWidths[2];
    
    // BIN column - center aligned (pick location)
    if (item.pickLocation) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(isNarrow ? 6 : 8);
      doc.text(item.pickLocation, xPos + colWidths[3] / 2, rowStartY + (isNarrow ? 0.1 : 0.2), { align: 'center', maxWidth: colWidths[3] - 0.1 });
    }
    xPos += colWidths[3];
    
    // Color column - center aligned
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isNarrow ? 6 : 8);
    doc.text(item.color || '', xPos + colWidths[4] / 2, rowStartY + (isNarrow ? 0.1 : 0.2), { align: 'center', maxWidth: colWidths[4] - 0.1 });
    xPos += colWidths[4];
    
    // Size column - center aligned
    doc.text(item.size || '', xPos + colWidths[5] / 2, rowStartY + (isNarrow ? 0.1 : 0.2), { align: 'center' });
    xPos += colWidths[5];
    
    // Quantity column - right aligned
    doc.text(item.quantity.toString(), xPos + colWidths[6], rowStartY + (isNarrow ? 0.1 : 0.2), { align: 'right' });
    
    // Move to next row
    currentY += rowHeight;
    
    // Draw row separator
    doc.setLineWidth(0.005);
    doc.line(x, currentY, x + width, currentY);
    currentY += 0.02;
  }

  return currentY;
}

async function drawFooter(doc: jsPDF, order: ProcessedOrder, x: number, y: number, width: number): Promise<void> {
  const isNarrow = width < 3.5; // Singles layout is narrower
  doc.setFontSize(isNarrow ? 6 : 8);
  doc.setFont('helvetica', 'normal');
  
  // Barcode on left (if available and not LTL/Local Pickup)
  if (order.shipstationOrderId && order.shipmethod && 
      !order.shipmethod.includes('LTL') && !order.shipmethod.includes('Local Pickup')) {
    try {
      // Use the full ShipStation order ID with ^#^ wrapper for scanning
      const barcodeValue = order.shipstationOrderId;
      const barcodeWidth = isNarrow ? 0.99 : 1.99; // Increased by additional 15% for better scannability
      const barcodeHeight = isNarrow ? 0.23 : 0.46; // Increased by 15% for better scannability
      // Generate barcode at target size for proper aspect ratio
      const barcodeDataUrl = await generateBarcodeAsync(barcodeValue, barcodeWidth, barcodeHeight);
      if (barcodeDataUrl) {
        doc.addImage(barcodeDataUrl, 'PNG', x, y - 0.25, barcodeWidth, barcodeHeight);
      }
    } catch (error) {
      console.warn('Failed to generate footer barcode:', error);
    }
  }
  
  // Page number (right aligned) - skip for singles to save space
  if (!isNarrow) {
    const pageInfo = doc.getCurrentPageInfo();
    const totalPages = doc.getNumberOfPages();
    doc.text(`Page ${pageInfo.pageNumber} of ${totalPages}`, x + width, y, { align: 'right' });
  }
}

/**
 * Generate a picklist PDF grouped by pick location (BIN)
 */
export async function generatePicklistPDF(orders: ProcessedOrder[]): Promise<void> {
  if (!orders || orders.length === 0) {
    throw new Error('No orders provided');
  }

  // Collect all items with their pick locations and order info
  interface PicklistItem {
    sku: string;
    description?: string;
    color?: string;
    pickLocation: string;
    totalQuantity: number;
    orders: Array<{ orderNumber: string; quantity: number }>;
  }

  // Use a composite key: location + SKU to handle same SKU in different locations
  const itemsByLocation = new Map<string, PicklistItem>();

  // Process all orders and aggregate items by pick location and SKU
  for (const order of orders) {
    for (const item of order.items) {
      const location = item.pickLocation || '-';
      const key = `${location}|${item.sku}`; // Composite key
      
      if (!itemsByLocation.has(key)) {
        itemsByLocation.set(key, {
          sku: item.sku,
          description: item.description,
          color: item.color,
          pickLocation: location,
          totalQuantity: 0,
          orders: [],
        });
      }

      const picklistItem = itemsByLocation.get(key)!;
      picklistItem.totalQuantity += item.quantity;
      
      // Check if this order already has this item
      const existingOrder = picklistItem.orders.find(o => o.orderNumber === order.orderNumber);
      if (existingOrder) {
        existingOrder.quantity += item.quantity;
      } else {
        picklistItem.orders.push({
          orderNumber: order.orderNumber,
          quantity: item.quantity,
        });
      }
    }
  }

  // Separate PERS and non-PERS items, and extract base SKUs
  interface ItemWithBaseSku extends PicklistItem {
    baseSku: string; // SKU without -PERS suffix
  }
  
  const persItems: ItemWithBaseSku[] = [];
  const nonPersItems: ItemWithBaseSku[] = [];
  
  for (const item of itemsByLocation.values()) {
    const baseSku = item.sku.endsWith('-PERS') ? item.sku.replace('-PERS', '') : item.sku;
    const itemWithBase: ItemWithBaseSku = { ...item, baseSku };
    
    if (item.sku.endsWith('-PERS')) {
      persItems.push(itemWithBase);
    } else {
      nonPersItems.push(itemWithBase);
    }
  }
  
  // Create maps by base SKU for easy matching
  const persByBaseSku = new Map<string, ItemWithBaseSku[]>();
  const nonPersByBaseSku = new Map<string, ItemWithBaseSku[]>();
  
  for (const item of persItems) {
    if (!persByBaseSku.has(item.baseSku)) {
      persByBaseSku.set(item.baseSku, []);
    }
    persByBaseSku.get(item.baseSku)!.push(item);
  }
  
  for (const item of nonPersItems) {
    if (!nonPersByBaseSku.has(item.baseSku)) {
      nonPersByBaseSku.set(item.baseSku, []);
    }
    nonPersByBaseSku.get(item.baseSku)!.push(item);
  }
  
  // Calculate total personalized cups
  const totalPersonalizedCups = persItems.reduce((sum, item) => sum + item.totalQuantity, 0);

  // Get all unique base SKUs and sort by location then base SKU
  const allBaseSkus = new Set<string>();
  for (const item of [...persItems, ...nonPersItems]) {
    allBaseSkus.add(item.baseSku);
  }
  
  // Sort base SKUs by the first item's location (prioritize PERS if both exist)
  const sortedBaseSkus = Array.from(allBaseSkus).sort((baseSkuA, baseSkuB) => {
    const persA = persByBaseSku.get(baseSkuA)?.[0];
    const nonPersA = nonPersByBaseSku.get(baseSkuA)?.[0];
    const persB = persByBaseSku.get(baseSkuB)?.[0];
    const nonPersB = nonPersByBaseSku.get(baseSkuB)?.[0];
    
    // Get location from PERS item if available, otherwise non-PERS
    const locationA = (persA || nonPersA)?.pickLocation || '-';
    const locationB = (persB || nonPersB)?.pickLocation || '-';
    
    if (locationA === '-' && locationB !== '-') return 1;
    if (locationB === '-' && locationA !== '-') return -1;
    
    const locationCompare = locationA.localeCompare(locationB);
    if (locationCompare !== 0) return locationCompare;
    
    return baseSkuA.localeCompare(baseSkuB);
  });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter',
  });

  const pageWidth = 8.5;
  const pageHeight = 11;
  const margin = 0.5;
  const contentWidth = pageWidth - (margin * 2);
  let currentY = margin;

  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('PICKLIST', margin, currentY);
  currentY += 0.3;

  // Create a 2x2 table for header info
  doc.setFontSize(9);
  const tableColWidth = contentWidth / 2;
  const tableRowHeight = 0.2;
  const tableStartX = margin;
  const tableStartY = currentY;
  
  // Row 1, Col 1: Generated
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, tableStartX, tableStartY);
  
  // Row 1, Col 2: Total Orders
  doc.text(`Total Orders: ${orders.length}`, tableStartX + tableColWidth, tableStartY);
  
  // Row 2, Col 1: First Order
  const row2Y = tableStartY + tableRowHeight;
  if (orders.length > 0 && orders[0].orderNumber) {
    doc.setFont('helvetica', 'bold');
    doc.text(`First Order: ${orders[0].orderNumber}`, tableStartX, row2Y);
  }
  
  // Row 2, Col 2: Personalized Cups
  doc.setFont('helvetica', 'bold');
  doc.text(`Personalized Cups: ${totalPersonalizedCups}`, tableStartX + tableColWidth, row2Y);
  
  currentY = row2Y + tableRowHeight + 0.1;

  // Draw header line under title block
  doc.setLineWidth(0.01);
  doc.line(margin, currentY, margin + contentWidth, currentY);
  currentY += 0.2;

  // Two-column layout: PERS on left, non-PERS on right
  const columnWidth = (contentWidth - 0.3) / 2; // Split width with gap between columns
  const leftColumnX = margin;
  const rightColumnX = margin + columnWidth + 0.3; // 0.3" gap between columns
  const colWidths = [0.8, 1.0, columnWidth - 0.8 - 1.0]; // Location, Qty, Item (no Color)
  const headers = ['LOCATION', 'QTY', 'ITEM'];
  const headerAlignments: Array<'left' | 'center' | 'right'> = ['center', 'center', 'left'];
  
  let xPos = margin;

  // Helper function to render a column header
  const renderColumnHeader = (x: number, title: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    let xPos = x;
    for (let i = 0; i < headers.length; i++) {
      const align = headerAlignments[i];
      if (align === 'center') {
        doc.text(headers[i], xPos + colWidths[i] / 2, currentY, { align: 'center' });
      } else if (align === 'right') {
        doc.text(headers[i], xPos + colWidths[i], currentY, { align: 'right' });
      } else {
        doc.text(headers[i], xPos, currentY, { align: 'left' });
      }
      xPos += colWidths[i];
    }
  };

  // Helper function to render a single item row
  const renderItemRow = (x: number, item: ItemWithBaseSku) => {
    const rowStartY = currentY;
    let xPos = x;

    // Location
    doc.setFont('helvetica', 'bold');
    doc.text(item.pickLocation, xPos + colWidths[0] / 2, rowStartY + 0.1, { align: 'center' });
    xPos += colWidths[0];

    // Quantity
    doc.setFont('helvetica', 'bold');
    doc.text(item.totalQuantity.toString(), xPos + colWidths[1] / 2, rowStartY + 0.1, { align: 'center' });
    xPos += colWidths[1];

    // SKU
    doc.setFont('helvetica', 'bold');
    doc.text(item.sku, xPos, rowStartY + 0.1);
  };

  // Render section headers
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('PERSONALIZED ITEMS', leftColumnX, currentY);
  doc.text('NON-PERSONALIZED ITEMS', rightColumnX, currentY);
  currentY += 0.25;

  // Render column headers for both columns
  renderColumnHeader(leftColumnX, 'PERSONALIZED');
  renderColumnHeader(rightColumnX, 'NON-PERSONALIZED');
  currentY += 0.15;
  
  // Draw header lines for both columns
  doc.setLineWidth(0.01);
  doc.line(leftColumnX, currentY, leftColumnX + columnWidth, currentY);
  doc.line(rightColumnX, currentY, rightColumnX + columnWidth, currentY);
  currentY += 0.15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  // Render items aligned by base SKU
  for (const baseSku of sortedBaseSkus) {
    const persItemsForSku = persByBaseSku.get(baseSku) || [];
    const nonPersItemsForSku = nonPersByBaseSku.get(baseSku) || [];
    const maxRowsForSku = Math.max(persItemsForSku.length, nonPersItemsForSku.length, 1);
    
    // Check if we need a new page (account for multiple rows)
    if (currentY + (maxRowsForSku * 0.2) + 0.1 > pageHeight - margin - 0.8) {
      doc.addPage();
      currentY = margin;
      
      // Redraw section headers
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('PERSONALIZED ITEMS', leftColumnX, currentY);
      doc.text('NON-PERSONALIZED ITEMS', rightColumnX, currentY);
      currentY += 0.25;
      
      // Redraw column headers
      renderColumnHeader(leftColumnX, 'PERSONALIZED');
      renderColumnHeader(rightColumnX, 'NON-PERSONALIZED');
      currentY += 0.15;
      
      doc.setLineWidth(0.01);
      doc.line(leftColumnX, currentY, leftColumnX + columnWidth, currentY);
      doc.line(rightColumnX, currentY, rightColumnX + columnWidth, currentY);
      currentY += 0.15;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }

    const rowStartY = currentY;
    
    // Render PERS items on the left (can be multiple if same base SKU in different locations)
    let persRowY = rowStartY;
    for (const persItem of persItemsForSku) {
      let xPos = leftColumnX;
      
      // Location
      doc.setFont('helvetica', 'bold');
      doc.text(persItem.pickLocation, xPos + colWidths[0] / 2, persRowY + 0.1, { align: 'center' });
      xPos += colWidths[0];
      
      // Quantity
      doc.setFont('helvetica', 'bold');
      doc.text(persItem.totalQuantity.toString(), xPos + colWidths[1] / 2, persRowY + 0.1, { align: 'center' });
      xPos += colWidths[1];
      
      // SKU
      doc.setFont('helvetica', 'bold');
      doc.text(persItem.sku, xPos, persRowY + 0.1);
      
      persRowY += 0.2; // Move down for next PERS item
    }
    
    // Render non-PERS items on the right (can be multiple if same base SKU in different locations)
    let nonPersRowY = rowStartY;
    for (const nonPersItem of nonPersItemsForSku) {
      let xPos = rightColumnX;
      
      // Location
      doc.setFont('helvetica', 'bold');
      doc.text(nonPersItem.pickLocation, xPos + colWidths[0] / 2, nonPersRowY + 0.1, { align: 'center' });
      xPos += colWidths[0];
      
      // Quantity
      doc.setFont('helvetica', 'bold');
      doc.text(nonPersItem.totalQuantity.toString(), xPos + colWidths[1] / 2, nonPersRowY + 0.1, { align: 'center' });
      xPos += colWidths[1];
      
      // SKU
      doc.setFont('helvetica', 'bold');
      doc.text(nonPersItem.sku, xPos, nonPersRowY + 0.1);
      
      nonPersRowY += 0.2; // Move down for next non-PERS item
    }

    // Move to next base SKU row (use the max height of both columns)
    currentY = rowStartY + (maxRowsForSku * 0.2);
    
    // Draw row separator
    doc.setLineWidth(0.005);
    doc.line(leftColumnX, currentY, leftColumnX + columnWidth, currentY);
    doc.line(rightColumnX, currentY, rightColumnX + columnWidth, currentY);
    currentY += 0.1;
  }

  // Open PDF in new tab instead of downloading
  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, '_blank');
  // Clean up the object URL after a short delay (browser will handle it when tab closes)
  setTimeout(() => URL.revokeObjectURL(pdfUrl), 100);
}

/**
 * Generate a combined PDF with both picklist and packing slips
 */
export async function generateCombinedPDF(orders: ProcessedOrder[]): Promise<void> {
  if (!orders || orders.length === 0) {
    throw new Error('No orders provided');
  }

  // Start with picklist generation - reuse the same logic from generatePicklistPDF
  // Collect all items with their pick locations and order info
  interface PicklistItem {
    sku: string;
    description?: string;
    color?: string;
    pickLocation: string;
    totalQuantity: number;
    orders: Array<{ orderNumber: string; quantity: number }>;
  }

  const itemsByLocation = new Map<string, PicklistItem>();

  for (const order of orders) {
    for (const item of order.items) {
      const location = item.pickLocation || '-';
      const key = `${location}|${item.sku}`;
      
      if (!itemsByLocation.has(key)) {
        itemsByLocation.set(key, {
          sku: item.sku,
          description: item.description,
          color: item.color,
          pickLocation: location,
          totalQuantity: 0,
          orders: [],
        });
      }

      const picklistItem = itemsByLocation.get(key)!;
      picklistItem.totalQuantity += item.quantity;
      
      const existingOrder = picklistItem.orders.find(o => o.orderNumber === order.orderNumber);
      if (existingOrder) {
        existingOrder.quantity += item.quantity;
      } else {
        picklistItem.orders.push({
          orderNumber: order.orderNumber,
          quantity: item.quantity,
        });
      }
    }
  }

  interface ItemWithBaseSku extends PicklistItem {
    baseSku: string;
  }
  
  const persItems: ItemWithBaseSku[] = [];
  const nonPersItems: ItemWithBaseSku[] = [];
  
  for (const item of itemsByLocation.values()) {
    const baseSku = item.sku.endsWith('-PERS') ? item.sku.replace('-PERS', '') : item.sku;
    const itemWithBase: ItemWithBaseSku = { ...item, baseSku };
    
    if (item.sku.endsWith('-PERS')) {
      persItems.push(itemWithBase);
    } else {
      nonPersItems.push(itemWithBase);
    }
  }
  
  const persByBaseSku = new Map<string, ItemWithBaseSku[]>();
  const nonPersByBaseSku = new Map<string, ItemWithBaseSku[]>();
  
  for (const item of persItems) {
    if (!persByBaseSku.has(item.baseSku)) {
      persByBaseSku.set(item.baseSku, []);
    }
    persByBaseSku.get(item.baseSku)!.push(item);
  }
  
  for (const item of nonPersItems) {
    if (!nonPersByBaseSku.has(item.baseSku)) {
      nonPersByBaseSku.set(item.baseSku, []);
    }
    nonPersByBaseSku.get(item.baseSku)!.push(item);
  }
  
  const totalPersonalizedCups = persItems.reduce((sum, item) => sum + item.totalQuantity, 0);

  const allBaseSkus = new Set<string>();
  for (const item of [...persItems, ...nonPersItems]) {
    allBaseSkus.add(item.baseSku);
  }
  
  const sortedBaseSkus = Array.from(allBaseSkus).sort((baseSkuA, baseSkuB) => {
    const persA = persByBaseSku.get(baseSkuA)?.[0];
    const nonPersA = nonPersByBaseSku.get(baseSkuA)?.[0];
    const persB = persByBaseSku.get(baseSkuB)?.[0];
    const nonPersB = nonPersByBaseSku.get(baseSkuB)?.[0];
    
    const locationA = (persA || nonPersA)?.pickLocation || '-';
    const locationB = (persB || nonPersB)?.pickLocation || '-';
    
    if (locationA === '-' && locationB !== '-') return 1;
    if (locationB === '-' && locationA !== '-') return -1;
    
    const locationCompare = locationA.localeCompare(locationB);
    if (locationCompare !== 0) return locationCompare;
    
    return baseSkuA.localeCompare(baseSkuB);
  });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter',
  });

  const pageWidth = 8.5;
  const pageHeight = 11;
  const margin = 0.5;
  const contentWidth = pageWidth - (margin * 2);
  let currentY = margin;

  // Picklist Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('PICKLIST', margin, currentY);
  currentY += 0.3;

  doc.setFontSize(9);
  const tableColWidth = contentWidth / 2;
  const tableRowHeight = 0.2;
  const tableStartX = margin;
  const tableStartY = currentY;
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, tableStartX, tableStartY);
  doc.text(`Total Orders: ${orders.length}`, tableStartX + tableColWidth, tableStartY);
  
  const row2Y = tableStartY + tableRowHeight;
  if (orders.length > 0 && orders[0].orderNumber) {
    doc.setFont('helvetica', 'bold');
    doc.text(`First Order: ${orders[0].orderNumber}`, tableStartX, row2Y);
  }
  
  doc.setFont('helvetica', 'bold');
  doc.text(`Personalized Cups: ${totalPersonalizedCups}`, tableStartX + tableColWidth, row2Y);
  
  currentY = row2Y + tableRowHeight + 0.1;

  doc.setLineWidth(0.01);
  doc.line(margin, currentY, margin + contentWidth, currentY);
  currentY += 0.2;

  const columnWidth = (contentWidth - 0.3) / 2;
  const leftColumnX = margin;
  const rightColumnX = margin + columnWidth + 0.3;
  const colWidths = [0.8, 1.0, columnWidth - 0.8 - 1.0];
  const headers = ['LOCATION', 'QTY', 'ITEM'];
  const headerAlignments: Array<'left' | 'center' | 'right'> = ['center', 'center', 'left'];
  
  const renderColumnHeader = (x: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    let xPos = x;
    for (let i = 0; i < headers.length; i++) {
      const align = headerAlignments[i];
      if (align === 'center') {
        doc.text(headers[i], xPos + colWidths[i] / 2, currentY, { align: 'center' });
      } else if (align === 'right') {
        doc.text(headers[i], xPos + colWidths[i], currentY, { align: 'right' });
      } else {
        doc.text(headers[i], xPos, currentY, { align: 'left' });
      }
      xPos += colWidths[i];
    }
  };

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('PERSONALIZED ITEMS', leftColumnX, currentY);
  doc.text('NON-PERSONALIZED ITEMS', rightColumnX, currentY);
  currentY += 0.25;

  renderColumnHeader(leftColumnX);
  renderColumnHeader(rightColumnX);
  currentY += 0.15;
  
  doc.setLineWidth(0.01);
  doc.line(leftColumnX, currentY, leftColumnX + columnWidth, currentY);
  doc.line(rightColumnX, currentY, rightColumnX + columnWidth, currentY);
  currentY += 0.15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  for (const baseSku of sortedBaseSkus) {
    const persItemsForSku = persByBaseSku.get(baseSku) || [];
    const nonPersItemsForSku = nonPersByBaseSku.get(baseSku) || [];
    const maxRowsForSku = Math.max(persItemsForSku.length, nonPersItemsForSku.length, 1);
    
    if (currentY + (maxRowsForSku * 0.2) + 0.1 > pageHeight - margin - 0.8) {
      doc.addPage();
      currentY = margin;
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('PERSONALIZED ITEMS', leftColumnX, currentY);
      doc.text('NON-PERSONALIZED ITEMS', rightColumnX, currentY);
      currentY += 0.25;
      
      renderColumnHeader(leftColumnX);
      renderColumnHeader(rightColumnX);
      currentY += 0.15;
      
      doc.setLineWidth(0.01);
      doc.line(leftColumnX, currentY, leftColumnX + columnWidth, currentY);
      doc.line(rightColumnX, currentY, rightColumnX + columnWidth, currentY);
      currentY += 0.15;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }

    const rowStartY = currentY;
    
    let persRowY = rowStartY;
    for (const persItem of persItemsForSku) {
      let xPos = leftColumnX;
      doc.setFont('helvetica', 'bold');
      doc.text(persItem.pickLocation, xPos + colWidths[0] / 2, persRowY + 0.1, { align: 'center' });
      xPos += colWidths[0];
      doc.text(persItem.totalQuantity.toString(), xPos + colWidths[1] / 2, persRowY + 0.1, { align: 'center' });
      xPos += colWidths[1];
      doc.text(persItem.sku, xPos, persRowY + 0.1);
      persRowY += 0.2;
    }
    
    let nonPersRowY = rowStartY;
    for (const nonPersItem of nonPersItemsForSku) {
      let xPos = rightColumnX;
      doc.setFont('helvetica', 'bold');
      doc.text(nonPersItem.pickLocation, xPos + colWidths[0] / 2, nonPersRowY + 0.1, { align: 'center' });
      xPos += colWidths[0];
      doc.text(nonPersItem.totalQuantity.toString(), xPos + colWidths[1] / 2, nonPersRowY + 0.1, { align: 'center' });
      xPos += colWidths[1];
      doc.text(nonPersItem.sku, xPos, nonPersRowY + 0.1);
      nonPersRowY += 0.2;
    }

    currentY = rowStartY + (maxRowsForSku * 0.2);
    
    doc.setLineWidth(0.005);
    doc.line(leftColumnX, currentY, leftColumnX + columnWidth, currentY);
    doc.line(rightColumnX, currentY, rightColumnX + columnWidth, currentY);
    currentY += 0.1;
  }

  // Add packing slips after picklist
  doc.addPage();

  const singlesOrders: ProcessedOrder[] = [];
  const otherOrders: ProcessedOrder[] = [];
  
  for (const order of orders) {
    if (order.boxSize === 'singles' || order.boxSize === '4pack') {
      singlesOrders.push(order);
    } else {
      otherOrders.push(order);
    }
  }

  let pageAdded = false;

  if (singlesOrders.length > 0) {
    for (let i = 0; i < singlesOrders.length; i += 2) {
      if (pageAdded) {
        doc.addPage();
      }
      pageAdded = true;

      const order1 = singlesOrders[i];
      if (!order1) {
        console.error('Missing order1 at index', i);
        continue;
      }

      const order2 = singlesOrders[i + 1];

      if (order2) {
        try {
          await generateTwoSinglesPage(doc, order1, order2);
        } catch (error) {
          console.error('Error generating two singles page:', error);
          throw error;
        }
      } else {
        try {
          await generatePackingSlipPage(doc, order1);
        } catch (error) {
          console.error('Error generating single packing slip page:', error);
          throw error;
        }
      }
    }
  }

  for (const order of otherOrders) {
    if (pageAdded) {
      doc.addPage();
    }
    pageAdded = true;
    
    try {
      await generatePackingSlipPage(doc, order);
    } catch (error) {
      console.error('Error generating packing slip page:', error);
      throw error;
    }
  }

  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, '_blank');
  setTimeout(() => URL.revokeObjectURL(pdfUrl), 100);
}
