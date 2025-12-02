import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import { ProcessedOrder } from './types';

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

  // Separate singles from other orders
  const singlesOrders: ProcessedOrder[] = [];
  const otherOrders: ProcessedOrder[] = [];
  
  for (const order of orders) {
    if (order.boxSize === 'singles') {
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

  // Save the PDF
  const filename = `packing-slips-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
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
      const artworkDataUrl = await loadImageAsDataUrl(order.customArtworkUrl, isNarrow ? 200 : 400, isNarrow ? 200 : 400);
      if (artworkDataUrl) {
        const imgWidth = isNarrow ? 0.85 : 1.7;
        const imgHeight = isNarrow ? 0.65 : 1.3;
        const format = artworkDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(artworkDataUrl, format, x + col1Width + (col2Width - imgWidth) / 2, currentY, imgWidth, imgHeight);
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
  const details = [
    { label: 'Order Number', value: order.orderNumber },
    { label: 'Item Fulfillment', value: order.tranid },
    { label: 'PO Number', value: order.poNumber || '' },
    { label: 'Order Notes', value: order.memo || '' },
    { label: 'Ship Method', value: order.shipmethod || '' },
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
 * Load an image from URL and convert to data URL
 */
async function loadImageAsDataUrl(url: string, maxWidth: number = 300, maxHeight: number = 300): Promise<string | null> {
  try {
    // If it's already a data URL, return it
    if (url.startsWith('data:')) {
      return url;
    }

    // Optimize imgix URLs with resize/compress parameters
    const optimizedUrl = optimizeImageUrl(url, maxWidth, maxHeight);

    // Fetch the image
    const response = await fetch(optimizedUrl, { mode: 'cors' });
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const blob = await response.blob();
    
    // Convert blob to data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
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
 */
async function generateBarcodeAsync(value: string): Promise<string | null> {
  if (!value) return null;
  
  try {
    // Use the value as-is (ShipStation barcodes need the ^#^ wrapper to scan)
    // For item barcodes, use the value directly
    // For ShipStation order IDs, keep the ^#^ wrapper
    
    // Create a temporary canvas
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, {
      format: 'CODE128',
      width: 2,
      height: 30,
      displayValue: true,
      fontSize: 12,
    });
    
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
        // Load and optimize item image (smaller size for table)
        const imgDataUrl = await loadImageAsDataUrl(item.imageUrl, isNarrow ? 100 : 200, isNarrow ? 100 : 200);
        if (imgDataUrl) {
          const imgWidth = isNarrow ? 0.2 : 0.4;
          const imgHeight = isNarrow ? 0.15 : 0.3;
          const imgY = rowStartY + (rowHeight - imgHeight) / 2; // Center vertically
          // Determine image format from data URL or URL extension
          const format = imgDataUrl.startsWith('data:image/png') ? 'PNG' : 
                        imgDataUrl.startsWith('data:image/jpeg') ? 'JPEG' :
                        item.imageUrl.toLowerCase().includes('.png') ? 'PNG' : 'JPEG';
          doc.addImage(imgDataUrl, format, xPos + 0.05, imgY, imgWidth, imgHeight);
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
        const barcodeDataUrl = await generateBarcodeAsync(item.barcode);
        if (barcodeDataUrl) {
          const barcodeWidth = isNarrow ? 0.75 : 1.5;
          const barcodeHeight = isNarrow ? 0.15 : 0.3;
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
      const barcodeDataUrl = await generateBarcodeAsync(barcodeValue);
      if (barcodeDataUrl) {
        const barcodeWidth = isNarrow ? 0.75 : 1.5;
        const barcodeHeight = isNarrow ? 0.15 : 0.3;
        doc.addImage(barcodeDataUrl, 'PNG', x, y - 0.25, barcodeWidth, barcodeHeight);
      }
    } catch (error) {
      console.warn('Failed to generate footer barcode:', error);
    }
  }
  
  // Page number (right aligned) - skip for singles to save space
  if (!isNarrow) {
    const pageInfo = doc.getCurrentPageInfo();
    doc.text(`Page ${pageInfo.pageNumber} of ${pageInfo.pages}`, x + width, y, { align: 'right' });
  }
}
