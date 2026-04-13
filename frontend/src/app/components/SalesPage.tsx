import React, { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import {
  ShoppingBag,
  Home,
  BarChart3,
  History,
  ChevronDown,
  Download,
  Wifi,
  Loader2,
} from "lucide-react";
import { Button } from "./ui/button";
import { api, downloadFile } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { getLastSyncTimestamp } from "../../services/storage";
import { format } from "date-fns";

interface SalesPageProps {
  onTabChange?: (tab: string) => void;
}

interface Transaction {
  _id: string;
  billNumber: string;
  createdAt: string;
  paymentMethod: string;
  items: any[];
  total: number;
  cashier: string;
}

export default function SalesPage({ onTabChange }: SalesPageProps) {
  const { user, shop } = useAuth();
  const [activeTab, setActiveTab] = useState("sales");
  
  // Filters
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("Newest first"); // Newest first, Oldest first, Highest amount, Lowest amount

  // Data State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [fromDate, toDate, paymentFilter, searchQuery, sortBy]);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams: any = { limit: 20, page: currentPage };
      if (fromDate) queryParams.from = new Date(fromDate).toISOString();
      if (toDate) queryParams.to = new Date(toDate).toISOString();
      if (paymentFilter !== "All") queryParams.paymentMethod = paymentFilter.toLowerCase();
      
      const res = await api.getSalesHistory(queryParams);
      if (res.success) {
        setTransactions(res.data);
        if (res.meta) setTotalPages(res.meta.pages);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, paymentFilter, currentPage]);

  useEffect(() => {
    fetchTransactions();
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [fetchTransactions]);

  const handlePrintReceipt = (transaction: Transaction) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt - ${transaction.billNumber}</title>
          <style>
            body { 
              font-family: monospace; 
              padding: 20px; 
              max-width: 300px; 
              margin: auto; 
              color: black;
              background: white;
            }
            .header { text-align: center; margin-bottom: 20px; }
            .header h2 { margin: 0; font-size: 1.2rem; }
            .item { display: flex; justify-content: space-between; margin-bottom: 5px; }
            .total { font-weight: bold; margin-top: 10px; border-top: 1px dashed black; padding-top: 10px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; }
            
            @media print {
              body { visibility: visible; }
              @page { margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>${shop?.name || "CounterCraft POS"}</h2>
            <p>Receipt: ${transaction.billNumber}</p>
            <p>Date: ${new Date(transaction.createdAt).toLocaleString()}</p>
            <p>Payment: ${transaction.paymentMethod.toUpperCase()}</p>
          </div>
          <div>
            ${transaction.items.map(item => `
              <div class="item">
                <span>${item.name} (x${item.quantity})</span>
                <span>Rs${Number(item.lineTotal).toFixed(2)}</span>
              </div>
            `).join("")}
          </div>
          <div class="item total">
            <span>TOTAL</span>
            <span>Rs${Number(transaction.total).toFixed(2)}</span>
          </div>
          <div class="footer">
            <p>Served by: ${transaction.cashier}</p>
            <p>Thank you for your business!</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const filteredTransactions = transactions
    .filter(t => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return t.billNumber.toLowerCase().includes(q) || t.cashier.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "Oldest first") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === "Highest amount") return b.total - a.total;
      if (sortBy === "Lowest amount") return a.total - b.total;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // Newest first
    });

  return (
    <div className="min-h-screen bg-stone-50 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>

      <div className="relative z-10 pb-24 px-4 sm:px-6 lg:px-8 pt-4 max-w-md sm:max-w-2xl lg:max-w-5xl xl:max-w-7xl mx-auto">
        {/* Professional Header */}
        <div className="mb-4">
          <div className="bg-gradient-to-br from-white via-purple-50 to-amber-50 rounded-2xl shadow-lg border-2 border-purple-200 p-5 lg:p-6">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-purple-100 rounded-lg">
                  <History className="w-5 h-5 text-purple-700" />
                </div>
                <p className="text-xs font-bold text-purple-700 uppercase tracking-wider">
                  RETAIL BILLING SUITE
                </p>
              </div>
              <h1 className="text-2xl font-bold text-stone-900 mb-1">
                Transaction History
              </h1>
              <p className="text-xs text-stone-600">
                View and manage all sales transactions.
              </p>
            </div>

            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className={`flex items-center gap-1.5 ${isOnline ? 'bg-gradient-to-r from-green-600 to-green-700' : 'bg-gradient-to-r from-red-500 to-red-600'} text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md`}>
                <Wifi className="w-3.5 h-3.5" />
                {isOnline ? "Online" : "Offline"}
              </div>
              <div className="flex items-center gap-1.5 bg-white border-2 border-stone-200 text-stone-700 px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm">
                <Download className="w-3.5 h-3.5 text-amber-700" />
                Last sync: {getLastSyncTimestamp() || "never"}
              </div>
            </div>

            <div>
              <span className="text-sm font-semibold text-stone-700">Account: {user?.displayName || user?.username}</span>
            </div>
          </div>
        </div>

        {/* Transaction History Section */}
        <div className="bg-gradient-to-br from-white to-stone-50 rounded-2xl shadow-lg border-2 border-stone-200 p-5 lg:p-6 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Download className="w-5 h-5 text-purple-700" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-stone-900">Filter & Export</h2>
                <p className="text-xs text-stone-600">Search and download records</p>
              </div>
            </div>
            {loading && <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />}
          </div>

          {/* Filters */}
          <div className="space-y-4 mb-6">
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-blue-700 font-bold mb-2 tracking-wider uppercase">From Date</label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full px-3 py-2.5 bg-white border-2 border-blue-300 rounded-lg text-stone-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-blue-700 font-bold mb-2 tracking-wider uppercase">To Date</label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full px-3 py-2.5 bg-white border-2 border-blue-300 rounded-lg text-stone-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-stone-700 font-bold mb-2 tracking-wider uppercase">Payment Method</label>
              <div className="relative">
                <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="w-full px-4 py-3 bg-white border-2 border-stone-300 rounded-xl text-stone-900 font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
                  <option>All</option>
                  <option>CASH</option>
                  <option>UPI</option>
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-stone-700 font-bold mb-2 tracking-wider uppercase">Search Transactions</label>
              <input type="text" placeholder="Bill no or cashier name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-4 py-3 bg-white border-2 border-stone-300 rounded-xl text-stone-900 placeholder:text-stone-400 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            </div>

            <div>
              <label className="block text-xs text-stone-700 font-bold mb-2 tracking-wider uppercase">Sort By</label>
              <div className="relative">
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full px-4 py-3 bg-white border-2 border-stone-300 rounded-xl text-stone-900 font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
                  <option>Newest first</option>
                  <option>Oldest first</option>
                  <option>Highest amount</option>
                  <option>Lowest amount</option>
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400 pointer-events-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3">
              <button 
                onClick={() => downloadFile("/sales/export/csv", "sales.csv", { search: searchQuery || undefined, from: fromDate ? new Date(fromDate).toISOString() : undefined, to: toDate ? new Date(toDate).toISOString() : undefined, paymentMethod: paymentFilter !== "All" ? paymentFilter.toLowerCase() : undefined })} 
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-95 text-sm cursor-pointer"
              >
                <Download className="w-5 h-5" /> Download CSV
              </button>
              <button 
                onClick={() => downloadFile("/sales/export/pdf", "sales.pdf", { search: searchQuery || undefined, from: fromDate ? new Date(fromDate).toISOString() : undefined, to: toDate ? new Date(toDate).toISOString() : undefined, paymentMethod: paymentFilter !== "All" ? paymentFilter.toLowerCase() : undefined })} 
                className="w-full py-3.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-95 text-sm cursor-pointer"
              >
                <Download className="w-5 h-5" /> Download PDF
              </button>
            </div>
          </div>
        </div>

        {/* Transaction Cards - Receipt Style */}
        <div className="mt-8 mb-4">
          <div className="flex items-center gap-2 px-1 mb-5">
            <div className="flex-1 h-0.5 bg-stone-200"></div>
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Transaction Records</span>
            {loading && <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />}
            <div className="flex-1 h-0.5 bg-stone-200"></div>
          </div>
          
          {filteredTransactions.length === 0 && !loading && (
            <p className="text-center text-stone-500 text-sm py-4">No transactions found.</p>
          )}
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
            {filteredTransactions.map((transaction, index) => {
              const dateStr = transaction.createdAt ? format(new Date(transaction.createdAt), 'Pp') : 'Unknown Date';
              return (
                <motion.div
                  key={transaction._id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white border-2 border-dashed border-stone-400 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
                >
                  {/* Receipt Header */}
                  <div className="bg-gradient-to-r from-stone-800 to-stone-900 text-white px-5 py-4 text-center border-b-2 border-dashed border-stone-500">
                    <h3 className="font-bold text-base tracking-widest uppercase">{shop?.name || "COUNTERCRAFT POS"}</h3>
                    <p className="text-xs text-stone-300 mt-1 font-medium">RETAIL BILLING SUITE</p>
                  </div>

                  {/* Receipt Body */}
                  <div className="p-4 space-y-3 font-mono text-sm">
                    {/* Bill Number */}
                    <div className="text-center pb-2 border-b border-dashed border-stone-300">
                      <p className="text-xs text-stone-500">BILL NO.</p>
                      <p className="text-xs font-bold text-stone-900 mt-1 break-all">{transaction.billNumber}</p>
                    </div>

                    {/* Date/Time */}
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-stone-600">Date/Time:</span>
                      <span className="text-xs text-stone-900 font-medium">{dateStr}</span>
                    </div>

                    <div className="border-t border-dashed border-stone-300"></div>

                    {/* Items */}
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-stone-600">Items:</span>
                      <span className="text-xs text-stone-900 font-medium">{transaction.items.length}</span>
                    </div>

                    {/* Payment Mode */}
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-stone-600">Payment:</span>
                      <span className="text-xs text-stone-900 font-bold bg-stone-100 px-2 py-0.5 rounded uppercase">{transaction.paymentMethod}</span>
                    </div>

                    <div className="border-t-2 border-dashed border-stone-400"></div>

                    {/* Total */}
                    <div className="flex justify-between items-center bg-stone-50 -mx-4 px-4 py-2">
                      <span className="text-sm font-bold text-stone-700">TOTAL:</span>
                      <span className="text-lg font-bold text-stone-900">₹{transaction.total.toLocaleString()}</span>
                    </div>

                    <div className="border-t border-dashed border-stone-300"></div>

                    {/* Cashier */}
                    <div className="text-center pt-1">
                      <p className="text-xs text-stone-500">Served by</p>
                      <p className="text-xs font-medium text-stone-900 mt-0.5">{transaction.cashier}</p>
                    </div>

                    <div className="text-center pt-2 border-t border-dashed border-stone-300 flex flex-col gap-2">
                      <p className="text-xs text-stone-400 italic">Thank you for your business!</p>
                      <Button variant="outline" size="sm" className="w-full text-xs h-8 border-stone-300" onClick={() => handlePrintReceipt(transaction)}>Print Receipt</Button>
                    </div>
                  </div>

                  <div className="h-3 bg-stone-100 border-t-2 border-dashed border-stone-300"></div>
                </motion.div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex justify-center items-center gap-4">
              <Button 
                variant="outline" 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                disabled={currentPage === 1 || loading}
                className="border-stone-300 text-stone-700 hover:bg-stone-100"
              >
                &larr; Previous
              </Button>
              <span className="text-sm font-medium text-stone-600">
                Page {currentPage} of {totalPages}
              </span>
              <Button 
                variant="outline" 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                disabled={currentPage === totalPages || loading}
                className="border-stone-300 text-stone-700 hover:bg-stone-100"
              >
                Next &rarr;
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-200 shadow-lg">
        <div className="max-w-md sm:max-w-2xl lg:max-w-5xl xl:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-safe">
          <div className="flex items-center justify-around lg:justify-center lg:gap-8 py-2 lg:py-3">
            {[
              { tab: "pos", icon: ShoppingBag, label: "POS" },
              { tab: "admin", icon: Home, label: "Admin" },
              { tab: "reports", icon: BarChart3, label: "Reports" },
              { tab: "sales", icon: History, label: "Sales" },
            ].map(({ tab, icon: Icon, label }) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all"
              >
                <div className={`p-2.5 rounded-lg transition-all ${activeTab === tab ? "bg-amber-700" : "bg-transparent"}`}>
                  <Icon className={`w-5 h-5 ${activeTab === tab ? "text-white" : "text-stone-400"}`} />
                </div>
                <span className={`text-[10px] font-medium ${activeTab === tab ? "text-amber-700" : "text-stone-500"}`}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
