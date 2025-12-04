import { NextResponse } from 'next/server';
import { 
  getPrintedOrders, 
  markOrdersAsPrinted, 
  clearPrintedOrders,
  unmarkOrdersAsPrinted 
} from '@/lib/db';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * GET - Get all printed order IDs
 */
export async function GET() {
  try {
    const printedOrders = await getPrintedOrders();
    return NextResponse.json({ printedOrders });
  } catch (error) {
    console.error('Error getting printed orders:', error);
    return NextResponse.json(
      { error: 'Failed to get printed orders' },
      { status: 500 }
    );
  }
}

/**
 * POST - Mark orders as printed
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tranids } = body;
    
    if (!Array.isArray(tranids)) {
      return NextResponse.json(
        { error: 'tranids must be an array' },
        { status: 400 }
      );
    }
    
    await markOrdersAsPrinted(tranids);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking orders as printed:', error);
    return NextResponse.json(
      { error: 'Failed to mark orders as printed' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Clear all printed orders or unmark specific ones
 */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const tranidsParam = url.searchParams.get('tranids');
    
    if (tranidsParam) {
      // Unmark specific orders
      const tranids = JSON.parse(tranidsParam);
      if (!Array.isArray(tranids)) {
        return NextResponse.json(
          { error: 'tranids must be an array' },
          { status: 400 }
        );
      }
      await unmarkOrdersAsPrinted(tranids);
    } else {
      // Clear all printed orders
      await clearPrintedOrders();
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error clearing printed orders:', error);
    return NextResponse.json(
      { error: 'Failed to clear printed orders' },
      { status: 500 }
    );
  }
}

