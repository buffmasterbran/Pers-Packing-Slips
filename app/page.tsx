'use client';

import { useState, useEffect, useMemo } from 'react';
import { NetSuiteItem, ProcessedOrder, OrderConfig } from '@/lib/types';
import { processOrders, filterOrders } from '@/lib/dataProcessing';
import { getPrintedOrders, markOrdersAsPrinted, clearPrintedOrders } from '@/lib/storage';
import { generatePackingSlipsPDF, generatePicklistPDF } from '@/lib/pdfGenerator';
import orderConfig from '../order-config.json';

export default function Home() {
  const [allOrders, setAllOrders] = useState<ProcessedOrder[]>([]);
  const [printedOrders, setPrintedOrders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [personalizedFilter, setPersonalizedFilter] = useState<boolean | null>(null);
  const [selectedCupSizes, setSelectedCupSizes] = useState<string[]>([]);
  const [selectedBoxSize, setSelectedBoxSize] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [printedFilter, setPrintedFilter] = useState<boolean | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<ProcessedOrder | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // Load data on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        
        // Load orders from API route
        const response = await fetch('/api/orders');
        if (!response.ok) {
          throw new Error('Failed to load orders');
        }
        
        const sampleResponse = await response.json();
        const items = (sampleResponse as { data: NetSuiteItem[] }).data;
        
        if (!items || !Array.isArray(items)) {
          throw new Error('Invalid data format');
        }
        
        const processed = processOrders(items, orderConfig as OrderConfig);
        setAllOrders(processed);
        
        // Load printed orders from localStorage
        setPrintedOrders(getPrintedOrders());
      } catch (err) {
        console.error('Error loading data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, []);

  // Filter orders
  const filteredOrders = useMemo(() => {
    return filterOrders(allOrders, {
      personalized: personalizedFilter,
      cupSizes: selectedCupSizes,
      boxSize: selectedBoxSize,
      dateFrom: dateFrom ? new Date(dateFrom) : null,
      dateTo: dateTo ? new Date(dateTo) : null,
      printedOnly: printedFilter,
      printedOrders,
    });
  }, [allOrders, personalizedFilter, selectedCupSizes, selectedBoxSize, dateFrom, dateTo, printedFilter, printedOrders]);

  // Clear selected orders when filters change (to avoid selecting orders that are no longer visible)
  useEffect(() => {
    setSelectedOrderIds(new Set());
  }, [personalizedFilter, selectedCupSizes, selectedBoxSize, dateFrom, dateTo, printedFilter]);

  // Handle cup size toggle
  const toggleCupSize = (size: string) => {
    if (size === 'all') {
      setSelectedCupSizes([]);
    } else {
      setSelectedCupSizes(prev => {
        if (prev.includes(size)) {
          return prev.filter(s => s !== size);
        } else {
          return [...prev, size];
        }
      });
    }
  };

  // Handle box size selection
  const handleBoxSizeChange = (boxSize: string | null) => {
    setSelectedBoxSize(boxSize);
  };

  // Handle print packing slips
  // Clear all printed orders (for development/testing)
  // You can call this from browser console: window.clearAllPrintedOrders()
  useEffect(() => {
    (window as any).clearAllPrintedOrders = () => {
      clearPrintedOrders();
      setPrintedOrders(new Set());
      alert('All orders cleared from printed status');
    };
  }, []);

  // Get selected orders from filtered orders
  const selectedOrders = useMemo(() => {
    return filteredOrders.filter(order => selectedOrderIds.has(order.tranid));
  }, [filteredOrders, selectedOrderIds]);

  const handleToggleOrder = (tranid: string) => {
    setSelectedOrderIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tranid)) {
        newSet.delete(tranid);
      } else {
        newSet.add(tranid);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedOrderIds.size === filteredOrders.length) {
      // Deselect all
      setSelectedOrderIds(new Set());
    } else {
      // Select all filtered orders
      setSelectedOrderIds(new Set(filteredOrders.map(o => o.tranid)));
    }
  };

  const handleSelectFirst = (count: number) => {
    const firstNOrders = filteredOrders.slice(0, count);
    setSelectedOrderIds(new Set(firstNOrders.map(o => o.tranid)));
  };

  const handlePrintPackingSlips = async () => {
    const ordersToPrint = selectedOrders.length > 0 ? selectedOrders : filteredOrders;
    
    if (ordersToPrint.length === 0) {
      alert('No orders selected to print');
      return;
    }

    try {
      await generatePackingSlipsPDF(ordersToPrint);
      
      // Mark orders as printed
      const tranids = ordersToPrint.map(o => o.tranid);
      markOrdersAsPrinted(tranids);
      setPrintedOrders(prev => {
        const newSet = new Set(prev);
        tranids.forEach(id => newSet.add(id));
        return newSet;
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  };

  const handleGeneratePicklist = async () => {
    const ordersToPrint = selectedOrders.length > 0 ? selectedOrders : filteredOrders;
    
    if (ordersToPrint.length === 0) {
      alert('No orders selected for picklist');
      return;
    }

    try {
      await generatePicklistPDF(ordersToPrint);
    } catch (error) {
      console.error('Error generating picklist:', error);
      alert('Error generating picklist. Please try again.');
    }
  };

  const cupSizes = ['10oz', '16oz', '26oz'];
  const boxSizes = [
    { key: 'singles', name: 'Singles' },
    { key: '4pack', name: '2/4 Pack' },
    { key: '5pack', name: '4/5 Pack' },
    { key: '10pack', name: '6/10 Pack' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-semibold text-gray-700">Loading orders...</div>
          <div className="mt-4 text-sm text-gray-500">This may take a moment for large datasets</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-semibold text-red-700">Error loading data</div>
          <div className="mt-4 text-sm text-gray-600">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Packing Slips - Personalized Orders</h1>

        {/* Filters Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Filters</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Personalized Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Personalized
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setPersonalizedFilter(null)}
                  className={`px-4 py-2 rounded ${
                    personalizedFilter === null
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setPersonalizedFilter(true)}
                  className={`px-4 py-2 rounded ${
                    personalizedFilter === true
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Personalized
                </button>
                <button
                  onClick={() => setPersonalizedFilter(false)}
                  className={`px-4 py-2 rounded ${
                    personalizedFilter === false
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Non-Personalized
                </button>
              </div>
            </div>

            {/* Cup Size Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cup Size
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => toggleCupSize('all')}
                  className={`px-4 py-2 rounded ${
                    selectedCupSizes.length === 0
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  All Sizes
                </button>
                {cupSizes.map(size => (
                  <button
                    key={size}
                    onClick={() => toggleCupSize(size)}
                    className={`px-4 py-2 rounded ${
                      selectedCupSizes.includes(size)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Box Size Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Box Size
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleBoxSizeChange(null)}
                  className={`px-4 py-2 rounded ${
                    selectedBoxSize === null
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  All Sizes
                </button>
                {boxSizes.map(box => (
                  <button
                    key={box.key}
                    onClick={() => handleBoxSizeChange(box.key)}
                    className={`px-4 py-2 rounded ${
                      selectedBoxSize === box.key
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {box.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Filters */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Printed Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Packing Slip Status
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setPrintedFilter(null)}
                  className={`px-4 py-2 rounded ${
                    printedFilter === null
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setPrintedFilter(true)}
                  className={`px-4 py-2 rounded ${
                    printedFilter === true
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Printed
                </button>
                <button
                  onClick={() => setPrintedFilter(false)}
                  className={`px-4 py-2 rounded ${
                    printedFilter === false
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Not Printed
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Results Summary and Print Button */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span className="text-lg font-semibold">
              {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''} found
            </span>
            {filteredOrders.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleSelectFirst(10)}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 border border-gray-300"
                >
                  Select First 10
                </button>
                <button
                  onClick={() => handleSelectFirst(20)}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 border border-gray-300"
                >
                  Select First 20
                </button>
                <button
                  onClick={() => handleSelectFirst(30)}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 border border-gray-300"
                >
                  Select First 30
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleGeneratePicklist}
              disabled={filteredOrders.length === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Generate Picklist ({selectedOrders.length > 0 ? selectedOrders.length : filteredOrders.length})
            </button>
            <button
              onClick={handlePrintPackingSlips}
              disabled={filteredOrders.length === 0}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Print Packing Slips ({selectedOrders.length > 0 ? selectedOrders.length : filteredOrders.length})
            </button>
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={filteredOrders.length > 0 && selectedOrderIds.size === filteredOrders.length}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fulfillment ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Personalized
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cup Sizes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Box Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Items
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Packing Slip Printed
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredOrders.map((order) => (
                  <tr key={order.tranid} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedOrderIds.has(order.tranid)}
                        onChange={() => handleToggleOrder(order.tranid)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {order.orderNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {order.tranid}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {order.datecreated}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {order.personalized ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          Yes
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {Array.from(order.cupSizes).join(', ') || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {order.boxSize ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          {order.boxSize === 'singles' 
                            ? 'Singles' 
                            : (orderConfig as OrderConfig).packSizes[order.boxSize]?.name || order.boxSize}
                        </span>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {printedOrders.has(order.tranid) ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          ✓ Printed
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          Not Printed
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"
                        title="View Order Details"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Order Details Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">
                  Order Details - {selectedOrder.orderNumber}
                </h2>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Content */}
              <div className="px-6 py-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Left Column */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Order Information</h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium">Order Number:</span> {selectedOrder.orderNumber}
                        </div>
                        <div>
                          <span className="font-medium">Fulfillment ID:</span> {selectedOrder.tranid}
                        </div>
                        <div>
                          <span className="font-medium">Date Created:</span> {selectedOrder.datecreated}
                        </div>
                        <div>
                          <span className="font-medium">PO Number:</span> {selectedOrder.poNumber || 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">Ship Method:</span> {selectedOrder.shipmethod || 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">Personalized:</span>{' '}
                          {selectedOrder.personalized ? (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                              Yes
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                              No
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Ship To</h3>
                      <div className="text-sm whitespace-pre-line text-gray-600">
                        {selectedOrder.shipaddress}
                      </div>
                    </div>

                    {selectedOrder.memo && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">Order Notes</h3>
                        <div className="text-sm text-gray-600">
                          {selectedOrder.memo}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Order Summary</h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium">Total Items:</span> {selectedOrder.items.length}
                        </div>
                        <div>
                          <span className="font-medium">Cup Sizes:</span>{' '}
                          {Array.from(selectedOrder.cupSizes).join(', ') || 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">Box Size:</span>{' '}
                          {selectedOrder.boxSize ? (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                              {selectedOrder.boxSize === 'singles'
                                ? 'Singles'
                                : (orderConfig as OrderConfig).packSizes[selectedOrder.boxSize]?.name || selectedOrder.boxSize}
                            </span>
                          ) : (
                            'N/A'
                          )}
                        </div>
                        {selectedOrder.shipstationOrderId && (
                          <div>
                            <span className="font-medium">ShipStation Order ID:</span>{' '}
                            {selectedOrder.shipstationOrderId.replace(/\^#\^/g, '').replace(/\^/g, '')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Items</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 border border-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Image</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Barcode</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Color</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {selectedOrder.items.map((item, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-2">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.sku}
                                  className="w-12 h-12 object-contain rounded"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <span className="text-gray-400 text-xs">No image</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-sm font-medium text-gray-900">{item.sku}</td>
                            <td className="px-4 py-2 text-sm text-gray-500">{item.description || 'N/A'}</td>
                            <td className="px-4 py-2 text-sm text-gray-500">{item.barcode || 'N/A'}</td>
                            <td className="px-4 py-2 text-sm text-gray-500">{item.color || 'N/A'}</td>
                            <td className="px-4 py-2 text-sm text-gray-500">{item.size || 'N/A'}</td>
                            <td className="px-4 py-2 text-sm text-gray-500">{item.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

