import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ShoppingBag, Search, Scan, Home, BarChart3, AlertTriangle, Plus, ScanLine,
  Wifi, WifiOff, Clock, ShoppingCart, TrendingUp, Users, DollarSign,
  Minus, X, History, Package, Loader2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import {
  getCachedProducts, setCachedProducts, getLastSyncTimestamp,
  setLastSyncTimestamp, queuePendingSale, getPendingSales, removePendingSale,
} from "../../services/storage";
import ScannerModal from "./ScannerModal";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";

interface Product {
  _id: string;
  name: string;
  barcode: string;
  category: string;
  price: number;
  stock: number;
  isActive: boolean;
}

interface POSPageProps {
  onTabChange?: (tab: string) => void;
}

export default function POSPage({ onTabChange }: POSPageProps) {
  const { user, shop, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("pos");
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi">("cash");
  const [tax, setTax] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [paidAmount, setPaidAmount] = useState("0");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [customerPhone, setCustomerPhone] = useState("");
  const [completedBill, setCompletedBill] = useState<any>(null);

  // Data state
  const [products, setProducts] = useState<Product[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSuccess, setBillingSuccess] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(getLastSyncTimestamp());

  // Summary stats
  const [summary, setSummary] = useState<any>(null);
  
  // Payment config
  const [shopUpiId, setShopUpiId] = useState<string>("");

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  // Fetch products
  const fetchProducts = useCallback(async () => {
    try {
      const result = await api.getProducts({ limit: 500 });
      if (result.success && Array.isArray(result.data)) {
        setProducts(result.data);
        setCachedProducts(result.data);
        setLastSyncTimestamp();
        setLastSync(new Date().toLocaleTimeString());
        setIsOnline(true);
      }
    } catch (err: any) {
      if (err.isNetworkError) {
        setIsOnline(false);
        setProducts(getCachedProducts());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch daily summary
  const fetchSummary = useCallback(async () => {
    try {
      const result = await api.getSalesSummary({ range: "daily" });
      if (result.success && result.data) {
        setSummary(result.data);
      }
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchSummary();
    
    // Fetch latest UPI
    api.getPaymentSettings().then(res => {
      if (res.success && res.data?.upiId) {
        setShopUpiId(res.data.upiId);
      }
    }).catch(() => {});

    const handleOnline = async () => {
      setIsOnline(true);
      const pending = getPendingSales();
      if (pending.length > 0) {
        let syncedCount = 0;
        for (const sale of pending) {
          try {
            await api.processBilling(sale.payload);
            removePendingSale(sale.id);
            syncedCount++;
          } catch (error) {
            console.error("Failed to sync pending sale:", sale.id, error);
          }
        }
        if (syncedCount > 0) {
          toast.success(`${syncedCount} offline sale(s) synced successfully`);
        }
      }
      fetchProducts();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [fetchProducts, fetchSummary]);

  // Filter products by search
  const filteredProducts = products.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.barcode.toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q)
    );
  });

  const lowStockProducts = products.filter((p) => p.stock <= 5 && p.isActive);

  const addToCart = (product: Product) => {
    const existingItem = cart.find((item) => item.product._id === product._id);
    if (existingItem) {
      if (existingItem.quantity >= product.stock) return; // prevent overselling
      setCart(cart.map((item) =>
        item.product._id === product._id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  const removeFromCart = (productId: string) => {
    const existingItem = cart.find((item) => item.product._id === productId);
    if (existingItem && existingItem.quantity > 1) {
      setCart(cart.map((item) =>
        item.product._id === productId ? { ...item, quantity: item.quantity - 1 } : item
      ));
    } else {
      setCart(cart.filter((item) => item.product._id !== productId));
    }
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const taxAmount = parseFloat(tax) || 0;
  const discountAmount = parseFloat(discount) || 0;
  const totalAmount = subtotal + taxAmount - discountAmount;

  const todaySales = summary?.overview?.totalRevenue || 0;
  const todayTransactions = summary?.overview?.totalTransactions || 0;

  const stats = [
    { label: "Today's Sales", value: `₹${todaySales.toLocaleString()}`, icon: DollarSign },
    { label: "Transactions", value: String(todayTransactions), icon: TrendingUp },
    { label: "Low Stock", value: String(lowStockProducts.length), icon: AlertTriangle },
  ];

  const handleClearCart = () => {
    setCart([]);
    setTax("0");
    setDiscount("0");
    setPaidAmount("0");
    setShowCheckout(false);
    setBillingError(null);
    setBillingSuccess(null);
    setCompletedBill(null);
    setCustomerPhone("");
  };

  const handleProcessBilling = async () => {
    setBillingLoading(true);
    setBillingError(null);
    setBillingSuccess(null);

    const billingPayload = {
      items: cart.map((item) => ({
        productId: item.product._id,
        barcode: item.product.barcode,
        quantity: item.quantity,
      })),
      paymentMethod,
      tax: taxAmount,
      discount: discountAmount,
      paidAmount: parseFloat(paidAmount) || totalAmount,
      cashier: user?.displayName || user?.username || "Default Cashier",
    };

    try {
      let generatedBillRef = "OfflineSync";
      if (!isOnline) {
        queuePendingSale(billingPayload);
        setBillingSuccess("Sale saved offline. It will sync when you're back online.");
      } else {
        const result = await api.processBilling(billingPayload);
        if (result.success) {
          generatedBillRef = result.data?.billNumber || "BIL-" + Date.now().toString().slice(-4);
          setBillingSuccess(`Bill ${generatedBillRef} created successfully!`);
        }
      }
      
      setCompletedBill({
        billNumber: generatedBillRef,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        items: [...cart],
        subtotal,
        tax: taxAmount,
        discount: discountAmount,
        total: totalAmount,
        paymentMethod
      });
      fetchProducts();
      fetchSummary();
    } catch (err: any) {
      setBillingError(err.message || "Billing failed");
    } finally {
      setBillingLoading(false);
    }
  };

  // Barcode scanner search
  const handleBarcodeSearch = async (textToSearch?: string) => {
    const target = (textToSearch || searchQuery).trim();
    if (!target) return;

    const normTarget = target.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

    // Local search first (fastest, works offline)
    // 1. Try exact alphanumeric match
    let localProduct = products.find(p => p.barcode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() === normTarget);
    
    // 2. Map standard UPCA (12 digits) to EAN13 (13 digits with leading zero) or vice versa
    if (!localProduct && /^\d+$/.test(normTarget)) {
      if (normTarget.length === 12) {
        const padded = "0" + normTarget;
        localProduct = products.find(p => p.barcode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() === padded);
      } else if (normTarget.length === 13 && normTarget.startsWith("0")) {
        const unpadded = normTarget.slice(1);
        localProduct = products.find(p => p.barcode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() === unpadded);
      }
    }

    if (localProduct) {
      addToCart(localProduct);
      setSearchQuery("");
      toast.success(`Added ${localProduct.name} to cart`);
      return;
    }

    // Fallback to API
    try {
      const result = await api.getProductByBarcode(target);
      if (result.success && result.data) {
        addToCart(result.data);
        setSearchQuery("");
        toast.success(`Added ${result.data.name} to cart`);
      }
    } catch {
      toast.error("Product not found");
      // Regular search filtering will continue naturally on the UI
    }
  };

  const handleWhatsAppShare = () => {
    if (!customerPhone || customerPhone.length < 10) {
      toast.error("Please enter a valid phone number");
      return;
    }
    const b = completedBill;
    if (!b) return;

    let text = `🧾 *${shop?.name || 'CounterCraft'} Receipt* 🧾\n`;
    text += `Date: ${b.date} ${b.time}\n`;
    text += `Bill No: ${b.billNumber}\n`;
    text += `---------------------------\n`;
    b.items.forEach((i: any) => {
      text += `${i.quantity}x ${i.product.name} - ₹${i.product.price * i.quantity}\n`;
    });
    text += `---------------------------\n`;
    text += `Subtotal: ₹${b.subtotal}\n`;
    if (b.tax > 0) text += `Tax: ₹${b.tax}\n`;
    if (b.discount > 0) text += `Discount: ₹${b.discount}\n`;
    text += `*Total Paid: ₹${b.total}*\n`;
    text += `Thank you for shopping!`;

    let phoneStr = customerPhone.replace(/\D/g, "");
    if (phoneStr.length === 10) phoneStr = "91" + phoneStr;
    window.open(`https://wa.me/${phoneStr}?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <>
      <div className="hidden print:block bg-white text-black min-h-screen w-full font-mono text-sm leading-tight p-4">
        {completedBill && (
          <div className="max-w-[80mm] pl-4">
            <div className="text-center font-bold mb-4">
              <h1 className="text-2xl print:text-black">{shop?.name || 'CounterCraft POS'}</h1>
              <p className="text-sm font-normal print:text-black">Retail Billing Suite</p>
            </div>
            <div className="border-b-2 border-black border-dashed pb-2 mb-2">
              <p className="print:text-black">Date: {completedBill.date} {completedBill.time}</p>
              <p className="print:text-black">Bill No: {completedBill.billNumber}</p>
              <p className="print:text-black">Method: {completedBill.paymentMethod.toUpperCase()}</p>
            </div>
            <div className="mb-2">
              <div className="flex justify-between font-bold border-b border-black pb-1 mb-1 print:text-black">
                <span>Item</span>
                <span>Amount</span>
              </div>
              {completedBill.items.map((i: any) => (
                <div key={i.product._id} className="flex justify-between mb-1 print:text-black">
                  <span>{i.quantity}x {i.product.name}</span>
                  <span>{i.product.price * i.quantity}</span>
                </div>
              ))}
            </div>
            <div className="border-t-2 border-black border-dashed pt-2">
              <div className="flex justify-between print:text-black"><span>Subtotal:</span><span>{completedBill.subtotal}</span></div>
              {completedBill.tax > 0 && <div className="flex justify-between print:text-black"><span>Tax:</span><span>{completedBill.tax}</span></div>}
              {completedBill.discount > 0 && <div className="flex justify-between print:text-black"><span>Discount:</span><span>{completedBill.discount}</span></div>}
              <div className="flex justify-between font-bold mt-2 text-lg print:text-black">
                <span>TOTAL:</span><span>₹{completedBill.total}</span>
              </div>
            </div>
            <div className="text-center mt-6">
              <p className="font-bold text-lg print:text-black">Thank You!</p>
            </div>
          </div>
        )}
      </div>

    <div className="min-h-screen bg-stone-50 relative overflow-hidden print:hidden">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>

      <div className="relative z-10 pb-24 px-4 sm:px-6 lg:px-8 pt-4 max-w-md sm:max-w-2xl lg:max-w-5xl xl:max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <div className="bg-gradient-to-br from-white to-amber-50 rounded-2xl shadow-lg border-2 border-amber-100 p-5 lg:p-6">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-center gap-3 lg:gap-4 flex-1">
                <div className="p-3 lg:p-4 bg-gradient-to-br from-amber-600 to-amber-700 rounded-xl shadow-md">
                  <ShoppingCart className="w-6 h-6 lg:w-7 lg:h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-xl lg:text-2xl font-bold text-stone-900">CounterCraft POS</h1>
                  <p className="text-xs lg:text-sm text-amber-700 font-semibold mt-0.5 tracking-wide">RETAIL BILLING SUITE</p>
                </div>
              </div>
              <div className={`flex items-center gap-1.5 ${isOnline ? 'bg-gradient-to-r from-green-600 to-green-700' : 'bg-gradient-to-r from-red-500 to-red-600'} text-white px-3 py-1.5 rounded-lg text-xs lg:text-sm font-bold shadow-md flex-shrink-0`}>
                {isOnline ? <Wifi className="w-3.5 h-3.5 lg:w-4 lg:h-4" /> : <WifiOff className="w-3.5 h-3.5 lg:w-4 lg:h-4" />}
                {isOnline ? "Online" : "Offline"}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3 lg:gap-4 mb-4">
              {stats.map((stat) => (
                <div key={stat.label} className="bg-white rounded-xl p-3 border-2 border-stone-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <stat.icon className="w-4 h-4 text-amber-700" />
                    </div>
                    <p className="text-[9px] text-stone-600 font-bold uppercase tracking-tight leading-tight">{stat.label}</p>
                    <p className="text-base font-bold text-stone-900">{stat.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-stone-600 pt-3 border-t-2 border-amber-200">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-700" />
                <span className="font-medium">Synced {lastSync || "never"}</span>
              </div>
              <span className="font-semibold text-amber-800">
                {user?.displayName || user?.username} ({user?.role})
              </span>
            </div>
          </div>
        </div>

        {/* Search Section */}
        <div className="mb-4">
          <Card className="bg-gradient-to-br from-white to-stone-50 shadow-md border-2 border-amber-100 rounded-xl p-5 lg:p-6">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-amber-100 rounded-md">
                  <Search className="w-4 h-4 lg:w-5 lg:h-5 text-amber-700" />
                </div>
                <h2 className="text-base lg:text-lg font-bold text-stone-800">Quick Search</h2>
              </div>
              <p className="text-xs lg:text-sm text-stone-600 ml-8 lg:ml-9">Find products by name, barcode, or SKU</p>
            </div>

            <div className="space-y-3 lg:space-y-4">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <Search className="w-5 h-5 lg:w-6 lg:h-6 text-stone-400" />
                </div>
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleBarcodeSearch(); }}
                  className="pl-12 lg:pl-14 h-12 lg:h-14 bg-white border-2 border-stone-200 focus:border-amber-600 focus:ring-2 focus:ring-amber-200 rounded-xl text-base lg:text-lg shadow-sm"
                />
              </div>

              <Button
                onClick={() => setIsScannerOpen(true)}
                className="w-full h-12 lg:h-14 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg rounded-xl font-semibold text-sm lg:text-base transition-all hover:shadow-xl"
              >
                <ScanLine className="w-5 h-5 lg:w-6 lg:h-6 mr-2" />
                Scan Product
              </Button>
            </div>
          </Card>
        </div>

        {/* Product List */}
        <div className="mb-4">
          <div className="flex items-center justify-between px-1 mb-3">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-700" />
              <h3 className="text-sm font-bold text-stone-800">Product Catalog</h3>
            </div>
            <span className="text-xs text-stone-500 bg-stone-100 px-2 py-1 rounded-md font-medium">
              {filteredProducts.length} items
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-amber-700 animate-spin" />
              <span className="ml-2 text-sm text-stone-600">Loading products...</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-stone-500 text-sm">
              {searchQuery ? "No products match your search" : "No products found. Add products in the Admin page."}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
              {filteredProducts.map((product) => {
                const cartItem = cart.find((item) => item.product._id === product._id);
                const quantity = cartItem?.quantity || 0;

                return (
                  <div key={product._id} className="bg-white shadow-md border-2 border-stone-200 rounded-xl p-4 hover:shadow-lg hover:border-amber-200 transition-all duration-200">
                    <div className="flex items-center gap-3.5">
                      <div className="p-3 bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl relative border border-amber-200">
                        <Package className="w-7 h-7 text-amber-700" />
                        {product.stock <= 5 && (
                          <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white shadow-sm"></div>
                        )}
                      </div>

                      <div className="flex-1">
                        <h3 className="font-bold text-stone-900 text-base">{product.name}</h3>
                        <p className="text-xs text-stone-500 mt-1">SKU: {product.barcode}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md">
                            {product.category || "General"}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${product.stock <= 5 ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'}`}>
                            {product.stock} in stock
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2.5">
                        <div className="bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                          <span className="text-xl font-bold text-amber-900">₹{product.price}</span>
                        </div>
                        {quantity > 0 ? (
                          <div className="flex items-center gap-1.5 bg-gradient-to-r from-amber-600 to-amber-700 rounded-xl p-1 shadow-md">
                            <button onClick={() => removeFromCart(product._id)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors active:scale-95">
                              <Minus className="w-4 h-4 text-white" />
                            </button>
                            <span className="text-base font-bold text-white min-w-[28px] text-center px-1">{quantity}</span>
                            <button onClick={() => addToCart(product)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors active:scale-95">
                              <Plus className="w-4 h-4 text-white" />
                            </button>
                          </div>
                        ) : (
                          <Button onClick={() => addToCart(product)} size="sm" className="h-9 px-4 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white shadow-md rounded-xl text-sm font-semibold active:scale-95 transition-all">
                            <Plus className="w-4 h-4 mr-1.5" />Add
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Low Stock Alerts */}
        {lowStockProducts.length > 0 && (
          <div className="mb-4">
            <Card className="bg-amber-50 border-l-4 border-l-amber-600 shadow-sm border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-amber-600 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-amber-900">Low Stock Alert</h3>
                  <p className="text-xs text-amber-700">Restock recommended</p>
                </div>
              </div>
              <div className="space-y-2">
                {lowStockProducts.slice(0, 5).map((product) => (
                  <div key={product._id} className="bg-white rounded-lg p-2.5 border border-amber-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-stone-600" />
                      <span className="text-sm font-medium text-stone-800">{product.name}</span>
                    </div>
                    <Badge className="bg-red-600 text-white text-xs px-2">{product.stock} left</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Floating Cart Summary */}
      <AnimatePresence>
        {totalItems > 0 && !showCheckout && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40"
          >
            <div className="bg-gradient-to-br from-white to-amber-50 rounded-2xl shadow-2xl border-3 border-amber-300 p-5 w-80">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-amber-600 to-amber-700 rounded-xl shadow-lg">
                    <ShoppingCart className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-stone-900">{totalItems} {totalItems === 1 ? 'item' : 'items'}</p>
                    <p className="text-xs text-amber-700 font-medium">Ready to checkout</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-stone-800">₹{subtotal}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => setShowCheckout(true)} variant="outline" className="h-11 border-2 border-stone-300 hover:bg-stone-50 text-stone-700 font-semibold rounded-lg">View Cart</Button>
                <Button onClick={() => setShowCheckout(true)} className="h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm rounded-lg">Pay Now</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Checkout Modal */}
      <AnimatePresence>
        {showCheckout && totalItems > 0 && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCheckout(false)} className="fixed inset-0 bg-black/50 z-50"></motion.div>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-md z-50">
              <div className="bg-white rounded-2xl shadow-2xl h-full overflow-y-auto border border-stone-200">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-stone-200">
                    <div>
                      <h2 className="text-xl font-bold text-stone-800">Checkout</h2>
                      <p className="text-xs text-stone-500 mt-0.5">Complete your transaction</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button onClick={handleClearCart} variant="ghost" size="sm" className="h-8 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 px-2">Clear</Button>
                      <Button onClick={() => setShowCheckout(false)} variant="ghost" size="sm" className="h-8 text-xs px-2">Close</Button>
                    </div>
                  </div>

                  {/* Success/Error Messages */}
                  {billingSuccess && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-green-700 font-medium">{billingSuccess}</p>
                    </div>
                  )}
                  {billingError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-red-700">{billingError}</p>
                    </div>
                  )}

                  <div className="bg-green-600 text-white rounded-lg p-3 mb-4">
                    <p className="text-sm font-bold">{totalItems} ITEM{totalItems > 1 ? 'S' : ''} • {paymentMethod.toUpperCase()}</p>
                    <p className="text-xs opacity-90 mt-0.5">Ready for payment</p>
                  </div>

                  {/* Cart Items */}
                  <div className="mb-4">
                    <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wide mb-2">Cart Items</h3>
                    <div className="space-y-2">
                      {cart.map((item) => (
                        <div key={item.product._id} className="bg-stone-50 rounded-lg p-2.5 border border-stone-100 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-white rounded border border-stone-200">
                              <Package className="w-4 h-4 text-stone-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-stone-800">{item.product.name}</p>
                              <p className="text-xs text-stone-500">₹{item.product.price} × {item.quantity}</p>
                            </div>
                          </div>
                          <p className="text-sm font-bold text-stone-800">₹{item.product.price * item.quantity}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tax */}
                  <div className="mb-3">
                    <label className="text-sm font-medium text-stone-700 mb-1.5 block">Tax</label>
                    <Input type="number" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0" className="h-11 bg-white border-stone-300 focus:border-amber-700 focus:ring-amber-700/10 rounded-lg" />
                  </div>

                  {/* Discount */}
                  <div className="mb-4">
                    <label className="text-sm font-medium text-stone-700 mb-1.5 block">Discount</label>
                    <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" className="h-11 bg-white border-stone-300 focus:border-amber-700 focus:ring-amber-700/10 rounded-lg" />
                  </div>

                  {/* Payment Method */}
                  <div className="mb-4">
                    <label className="text-sm font-medium text-stone-700 mb-2 block">PAYMENT METHOD</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setPaymentMethod("cash")} className={`h-11 rounded-lg font-medium transition-all ${paymentMethod === "cash" ? "bg-blue-600 text-white shadow-sm" : "bg-white border-2 border-stone-300 text-stone-700 hover:border-stone-400"}`}>Cash</button>
                      <button onClick={() => setPaymentMethod("upi")} className={`h-11 rounded-lg font-medium transition-all ${paymentMethod === "upi" ? "bg-blue-600 text-white shadow-sm" : "bg-white border-2 border-stone-300 text-stone-700 hover:border-stone-400"}`}>UPI</button>
                    </div>
                  </div>

                  {paymentMethod === "upi" && (
                    <div className="mb-4 text-center">
                      {shopUpiId ? (
                         <div className="bg-white p-4 border-2 border-blue-100 rounded-xl flex flex-col items-center justify-center shadow-inner">
                           <QRCode value={`upi://pay?pa=${shopUpiId}&pn=CounterCraft&am=${totalAmount}`} size={160} />
                           <p className="text-xs font-bold text-blue-700 mt-3 uppercase tracking-wide">Scan to Pay ₹{totalAmount}</p>
                         </div>
                      ) : (
                         <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium flex flex-col items-center justify-center">
                           <AlertTriangle className="w-5 h-5 mb-1" />
                           UPI ID not configured in Admin Settings.
                         </div>
                      )}
                    </div>
                  )}

                  {/* Paid Amount */}
                  <div className="mb-4">
                    <label className="text-sm font-medium text-stone-700 mb-1.5 block">Paid Amount</label>
                    <Input type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="0" className="h-11 bg-white border-stone-300 focus:border-amber-700 focus:ring-amber-700/10 rounded-lg" />
                  </div>

                  {/* Cashier */}
                  <div className="mb-4">
                    <label className="text-sm font-medium text-stone-700 mb-1.5 block">Cashier</label>
                    <Input type="text" value={user?.displayName || user?.username || "Default Cashier"} readOnly className="h-11 bg-stone-50 border-stone-300 text-stone-600 rounded-lg" />
                  </div>

                  {/* Total */}
                  <div className="bg-amber-50 rounded-lg p-4 mb-4 border border-amber-200">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-stone-700">Subtotal</span>
                      <span className="text-sm font-semibold text-stone-800">₹{subtotal}</span>
                    </div>
                    {taxAmount > 0 && (
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-stone-700">Tax</span>
                        <span className="text-sm font-semibold text-stone-800">+₹{taxAmount}</span>
                      </div>
                    )}
                    {discountAmount > 0 && (
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-stone-700">Discount</span>
                        <span className="text-sm font-semibold text-green-700">-₹{discountAmount}</span>
                      </div>
                    )}
                    <div className="border-t border-amber-200 pt-2.5 mt-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-base font-bold text-stone-800">Total</span>
                        <span className="text-2xl font-bold text-blue-600">₹{totalAmount}</span>
                      </div>
                    </div>
                  </div>

                  {!completedBill ? (
                    <Button
                      onClick={handleProcessBilling}
                      disabled={billingLoading}
                      className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm rounded-lg"
                    >
                      {billingLoading ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                      ) : (
                        "Proceed to Payment"
                      )}
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      {/* Whatsapp Section */}
                      <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 shadow-sm">
                        <label className="text-sm font-semibold text-stone-800 mb-2 block">Share E-Receipt</label>
                        <div className="flex gap-2">
                          <Input 
                            placeholder="WhatsApp Number (e.g. 9876543210)" 
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            className="bg-white"
                          />
                          <Button onClick={handleWhatsAppShare} className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 shrink-0 transition-transform active:scale-95">
                            Send
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          onClick={async () => {
                            try {
                              if (Capacitor.isNativePlatform()) {
                                const { Printer } = await import("@capgo/capacitor-printer");
                                await Printer.printWebView();
                              } else {
                                window.print();
                              }
                            } catch (err) {
                              console.error("Print error:", err);
                              toast.error("Failed to open print dialog");
                            }
                          }}
                          variant="outline"
                          className="h-12 border-2 border-stone-300 text-stone-800 hover:bg-stone-50 font-bold w-full transition-transform active:scale-95"
                        >
                          🖨️ Print
                        </Button>
                        <Button
                          onClick={handleClearCart}
                          className="h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold w-full transition-transform active:scale-95"
                        >
                          ✅ New Sale
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-200 shadow-lg">
        <div className="max-w-md sm:max-w-2xl lg:max-w-5xl xl:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-safe">
          <div className="flex items-center justify-around lg:justify-center lg:gap-8 py-2 lg:py-3">
            {[
              { tab: "pos", icon: ShoppingBag, label: "POS" },
              { tab: "admin", icon: Home, label: "Admin" },
              { tab: "reports", icon: BarChart3, label: "Reports" },
              { tab: "sales", icon: History, label: "Sales" },
            ].map(({ tab, icon: Icon, label }) => (
              <button key={tab} onClick={() => handleTabChange(tab)} className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all">
                <div className={`p-2.5 rounded-lg transition-all ${activeTab === tab ? "bg-amber-700" : "bg-transparent"}`}>
                  <Icon className={`w-5 h-5 ${activeTab === tab ? "text-white" : "text-stone-400"}`} />
                </div>
                <span className={`text-[10px] font-medium ${activeTab === tab ? "text-amber-700" : "text-stone-500"}`}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      
      <ScannerModal 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
        onScan={(text) => {
           setSearchQuery(text);
           setIsScannerOpen(false);
           setTimeout(() => {
              handleBarcodeSearch(text);
           }, 100);
        }} 
      />
    </div>
    </>
  );
}
