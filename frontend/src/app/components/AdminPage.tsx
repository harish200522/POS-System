import React, { useState, useEffect, useCallback } from "react";
import {
  ShoppingBag, Search, Home, BarChart3, Settings, Wifi, Clock, Plus,
  RefreshCw, Download, Printer, Edit, Archive, Upload, Menu, X, Package,
  History, Loader2, Play, Scan, QrCode
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "./ui/select";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { getLastSyncTimestamp } from "../../services/storage";
import ScannerModal from "./ScannerModal";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

interface Product {
  _id: string;
  name: string;
  barcode: string;
  category: string;
  price: number;
  stock: number;
  isActive: boolean;
}

interface User {
  id: string;
  username: string;
  displayName: string;
  role: string;
  isActive: boolean;
}

interface AdminPageProps {
  onTabChange?: (tab: string) => void;
}

export default function AdminPage({ onTabChange }: AdminPageProps) {
  const { user, logout } = useAuth();
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [activeTab, setActiveTab] = useState("admin");

  const [showMenu, setShowMenu] = useState(false);
  const [menuPage, setMenuPage] = useState<"main" | "settings" | "inventory">("main");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState<string | null>(getLastSyncTimestamp());

  // Product Form State
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [category, setCategory] = useState("General");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [productMessage, setProductMessage] = useState<{ type: "success"|"error", text: string } | null>(null);

  // Inventory State
  const [inventory, setInventory] = useState<Product[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("Name A-Z");
  const [updatingStockId, setUpdatingStockId] = useState<string | null>(null);

  // Settings: Users State
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState("All users");
  const [isUpdatingUser, setIsUpdatingUser] = useState<string | null>(null);

  // Settings: Payment State
  const [upiId, setUpiId] = useState("");
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [hasLoadedPayment, setHasLoadedPayment] = useState(false);

  // General Handlers
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  const handleLogout = async () => {
    await logout();
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // -- API DATA FETCHING --
  const fetchInventory = useCallback(async () => {
    setLoadingInventory(true);
    try {
      const res = await api.getProducts({ limit: 500, includeInactive: "true" });
      if (res.success) {
        setInventory(res.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingInventory(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await api.getUsers();
      if (res.success) {
        setUsers(res.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const fetchPaymentSettings = useCallback(async () => {
    setLoadingPayment(true);
    try {
      const res = await api.getPaymentSettings();
      if (res.success && res.data) {
        setUpiId(res.data.upiId || "");
      }
    } catch {
      // API handles error
    } finally {
      setLoadingPayment(false);
    }
  }, []);

  // Fetch when menu pages open
  useEffect(() => {
    if (menuPage === "inventory" && inventory.length === 0) fetchInventory();
    if (menuPage === "settings") {
      if (users.length === 0) fetchUsers();
      if (!hasLoadedPayment) {
        fetchPaymentSettings();
        setHasLoadedPayment(true);
      }
    }
  }, [menuPage, fetchInventory, fetchUsers, fetchPaymentSettings, inventory.length, users.length, hasLoadedPayment]);

  // -- PRODUCT ACTIONS --
  const handleSaveProduct = async () => {
    setProductMessage(null);
    if (!productName || !price || !stock) {
      setProductMessage({ type: "error", text: "Name, price, and stock are required." });
      return;
    }

    setIsSavingProduct(true);
    try {
      const payload = {
        name: productName,
        category,
        price: parseFloat(price),
        stock: parseInt(stock, 10),
        barcode: barcode.trim() || undefined, // Allow empty for auto-generation (handled by backend if supported, or error)
      };

      if (!payload.barcode) {
        // If the user leaves it blank but it's required by our API, let's auto-generate a random one here just in case.
        payload.barcode = "BC" + Date.now();
      }

      if (editingProductId) {
        await api.updateProduct(editingProductId, payload);
        setProductMessage({ type: "success", text: "Product updated successfully!" });
      } else {
        await api.addProduct(payload);
        setProductMessage({ type: "success", text: "Product added successfully!" });
      }
      
      // Reset form
      setProductName("");
      setBarcode("");
      setPrice("");
      setStock("");
      setCategory("General");
      setEditingProductId(null);
      
      // Refresh inventory if we're on that tab or next time
      fetchInventory();
    } catch (err: any) {
      setProductMessage({ type: "error", text: err.message || "Failed to save product" });
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleEditProduct = (prod: Product) => {
    setEditingProductId(prod._id);
    setProductName(prod.name);
    setBarcode(prod.barcode);
    setCategory(prod.category || "General");
    setPrice(String(prod.price));
    setStock(String(prod.stock));
    setShowMenu(false); // Close menu to show the form
  };

  const handleDeactivateProduct = async (prod: Product) => {
    try {
      if (prod.isActive) {
        await api.deleteProduct(prod._id);
      } else {
        // Reactivate
        await api.updateProduct(prod._id, { isActive: true });
      }
      fetchInventory();
    } catch (err: any) {
      toast.error("Failed to toggle product status: " + err.message);
    }
  };

  const handleAddStock = async (prod: Product, amount: number) => {
    setUpdatingStockId(prod._id);
    try {
      await api.updateStock(prod._id, { quantity: amount, mode: "add" });
      fetchInventory();
    } catch (err: any) {
      toast.error("Failed to add stock: " + err.message);
    } finally {
      setUpdatingStockId(null);
    }
  };

  // -- USER ACTIONS --
  const handleToggleUserStatus = async (u: User) => {
    setIsUpdatingUser(u.id);
    try {
      await api.updateUserStatus(u.id, { isActive: !u.isActive });
      fetchUsers();
    } catch (err: any) {
      toast.error("Failed to update user status: " + err.message);
    } finally {
      setIsUpdatingUser(null);
    }
  };

  const handleResetPassword = (u: User) => {
    setResetTargetUser(u);
    setNewPassword("");
    setConfirmPassword("");
    setIsResetModalOpen(true);
  };

  const submitResetPassword = async () => {
    if (!resetTargetUser) return;
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    try {
      await api.resetUserPassword(resetTargetUser.id, { newPassword: newPassword });
      toast.success("Password reset successfully.");
      setIsResetModalOpen(false);
    } catch (err: any) {
      toast.error("Failed to reset password: " + err.message);
    }
  };

  // -- PAYMENT ACTIONS --
  const handleSavePaymentSettings = async () => {
    if (upiId && !upiId.includes("@")) {
      toast.error("Invalid UPI ID: must include '@'");
      return;
    }
    setIsSavingPayment(true);
    try {
      await api.savePaymentSettings({ upiId });
      toast.success("Payment settings saved!");
    } catch (err: any) {
      toast.error("Failed to save payment settings: " + err.message);
    } finally {
      setIsSavingPayment(false);
    }
  };

  // Filtered/Sorted Data
  const filteredInventory = inventory
    .filter(p => {
      if (statusFilter === "Active" && !p.isActive) return false;
      if (statusFilter === "Inactive" && p.isActive) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q) || (p.category||"").toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "Name Z-A") return b.name.localeCompare(a.name);
      if (sortBy === "Price Low-High") return a.price - b.price;
      if (sortBy === "Price High-Low") return b.price - a.price;
      if (sortBy === "Stock Low-High") return a.stock - b.stock;
      return a.name.localeCompare(b.name); // Name A-Z
    });

  const filteredUsers = users.filter(u => {
    if (userFilter === "Admins" && u.role !== "admin") return false;
    if (userFilter === "Cashiers" && u.role !== "cashier") return false;
    if (userSearch) {
      const q = userSearch.toLowerCase();
      return u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-stone-50 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>

      <div className="relative z-10 pb-24 px-4 sm:px-6 lg:px-8 pt-4 max-w-md sm:max-w-2xl lg:max-w-5xl xl:max-w-7xl mx-auto">
        {/* Professional Header */}
        <div className="mb-4">
          <div className="bg-gradient-to-br from-white to-stone-50 rounded-2xl shadow-lg border-2 border-stone-200 p-5 lg:p-6">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-stone-200 rounded-lg">
                  <Home className="w-5 h-5 text-stone-700" />
                </div>
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                  RETAIL BILLING SUITE
                </p>
              </div>
              <h1 className="text-2xl font-bold text-stone-900 mb-1">
                Admin Dashboard
              </h1>
              <p className="text-xs text-stone-600">
                Manage inventory, settings, and business operations.
              </p>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <div className={`flex items-center gap-1.5 ${isOnline ? 'bg-gradient-to-r from-green-600 to-green-700' : 'bg-gradient-to-r from-red-500 to-red-600'} text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md`}>
                {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5 opacity-50" />}
                {isOnline ? "Online" : "Offline"}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-stone-600 mb-4 pb-3 border-b-2 border-stone-200">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-700" />
                <span className="font-medium">Last sync: {lastSync || "never"}</span>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-stone-700">Account: {user?.displayName || user?.username} ({user?.role})</span>
              <div className="flex items-center gap-2">
                <Button onClick={() => { setShowMenu(true); setMenuPage("main"); }} variant="outline" size="sm" className="h-9 px-4 text-sm border-2 border-amber-600 hover:bg-amber-50 text-amber-700 rounded-xl font-semibold shadow-sm">
                  <Menu className="w-4 h-4 mr-1.5" />
                  Menu
                </Button>
                <Button onClick={handleLogout} size="sm" className="h-9 px-4 text-sm bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl font-semibold shadow-md">
                  Logout
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button onClick={() => { setEditingProductId(null); setProductName(""); setBarcode(""); setPrice(""); setStock(""); setCategory("General"); setProductMessage(null); }} className="h-11 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded-xl text-sm font-bold shadow-md active:scale-95 transition-all">
                <Plus className="w-4 h-4 mr-2" />
                New Product
              </Button>
              <Button onClick={fetchInventory} disabled={loadingInventory} className="h-11 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl text-sm font-bold shadow-md active:scale-95 transition-all">
                <RefreshCw className={`w-4 h-4 mr-2 ${loadingInventory ? 'animate-spin' : ''}`} />
                Sync Data
              </Button>
            </div>
          </div>
        </div>

        {/* Add/Edit Product Section */}
        <div className="mb-4">
          <Card className="bg-white shadow-sm border border-stone-200 rounded-xl p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-stone-800 mb-1">{editingProductId ? "Edit Product" : "Add Product"}</h2>
                <p className="text-xs text-stone-600">Create or edit products with price, stock, and barcode.</p>
              </div>
              {editingProductId && (
                <Button variant="ghost" size="sm" onClick={() => { setEditingProductId(null); setProductName(""); setBarcode(""); setPrice(""); setStock(""); setCategory("General"); setProductMessage(null); }}>
                  Cancel Edit
                </Button>
              )}
            </div>

            {productMessage && (
              <div className={`mb-4 p-3 rounded-lg border text-sm font-medium ${productMessage.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                {productMessage.text}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <Label htmlFor="productName" className="text-sm font-medium text-stone-700 mb-1.5 block">Product Name</Label>
                <Input id="productName" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Enter product name" className="h-11 bg-white border-stone-300 focus:border-amber-700 focus:ring-amber-700/10 rounded-lg" />
              </div>
              <div>
                <Label htmlFor="barcode" className="text-sm font-medium text-stone-700 mb-1.5 block">Barcode / QR</Label>
                <div className="flex gap-2">
                   <Input id="barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Leave blank to auto-generate" className="h-11 bg-white border-stone-300 focus:border-amber-700 focus:ring-amber-700/10 rounded-lg flex-1" />
                   <Button variant="outline" className="h-11 px-3 border-stone-300" onClick={() => setIsScannerOpen(true)}>
                     <Scan className="w-5 h-5" />
                   </Button>
                </div>
                {barcode && (
                  <div className="p-4 mt-3 bg-stone-50 border border-stone-200 rounded-lg flex flex-col items-center">
                     <p className="text-xs text-stone-500 font-bold tracking-wider mb-2 uppercase">Product QR Code</p>
                     <div className="p-2 bg-white rounded-lg shadow-sm border border-stone-200" id="qr-preview-box">
                        <QRCode value={barcode} size={130} />
                     </div>
                     <Button variant="outline" size="sm" className="mt-3 text-xs h-8 border-stone-300" onClick={() => {
                       const svg = document.getElementById("qr-preview-box")?.querySelector("svg");
                       if (!svg) return;
                       const svgData = new XMLSerializer().serializeToString(svg);
                       const canvas = document.createElement("canvas");
                       const ctx = canvas.getContext("2d");
                       const img = new Image();
                       img.onload = () => {
                         canvas.width = 130; canvas.height = 130; 
                         if (ctx) {
                           ctx.fillStyle = "white";
                           ctx.fillRect(0, 0, canvas.width, canvas.height);
                           ctx.drawImage(img, 0, 0);
                         }
                         const pwa = canvas.toDataURL("image/png");
                         const link = document.createElement("a");
                         link.download = `QR_${productName || "Product"}.png`;
                         link.href = pwa;
                         link.click();
                       };
                       img.src = "data:image/svg+xml;base64," + btoa(svgData);
                     }}>
                       <Download className="w-3.5 h-3.5 mr-1" /> Download PNG
                     </Button>
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="category" className="text-sm font-medium text-stone-700 mb-1.5 block">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-11 bg-white border-stone-300 focus:border-amber-700 focus:ring-amber-700/10 rounded-lg">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General">General</SelectItem>
                    <SelectItem value="Cloth">Cloth</SelectItem>
                    <SelectItem value="Biscuit">Biscuit</SelectItem>
                    <SelectItem value="Stationery">Stationery</SelectItem>
                    <SelectItem value="Beverages">Beverages</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="price" className="text-sm font-medium text-stone-700 mb-1.5 block">Price</Label>
                <Input id="price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className="h-11 bg-white border-stone-300 focus:border-amber-700 focus:ring-amber-700/10 rounded-lg" />
              </div>
              <div>
                <Label htmlFor="stock" className="text-sm font-medium text-stone-700 mb-1.5 block">Stock</Label>
                <Input id="stock" type="number" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" className="h-11 bg-white border-stone-300 focus:border-amber-700 focus:ring-amber-700/10 rounded-lg" />
              </div>

              <Button onClick={handleSaveProduct} disabled={isSavingProduct} className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white shadow-sm rounded-lg font-semibold">
                {isSavingProduct ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingProductId ? "Update Product" : "Save Product")}
              </Button>
            </div>
          </Card>
        </div>

        {/* Menu Slide-in Panel */}
        {showMenu && (
          <>
            <div onClick={() => setShowMenu(false)} className="fixed inset-0 bg-black/50 z-50"></div>
            <div className="fixed inset-0 z-50 flex justify-end">
              <div className="w-full max-w-md bg-white shadow-2xl h-full flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 pb-24">
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-stone-200">
                    <div className="flex items-center gap-2">
                      {menuPage !== "main" && (
                        <Button onClick={() => setMenuPage("main")} variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <X className="w-5 h-5 rotate-45" /> {/* Just replacing back arrow for simplicity since we don't have ChevronLeft imported */}
                        </Button>
                      )}
                      <h2 className="text-xl font-bold text-stone-800">
                        {menuPage === "main" ? "Menu" : menuPage === "settings" ? "Settings" : "Inventory"}
                      </h2>
                    </div>
                    <Button onClick={() => setShowMenu(false)} variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <X className="w-5 h-5" />
                    </Button>
                  </div>

                  {menuPage === "main" && (
                    <div className="space-y-2">
                      <Button onClick={() => setMenuPage("settings")} variant="outline" className="w-full h-14 border-stone-300 hover:bg-stone-50 text-stone-700 rounded-lg font-medium justify-start text-base">
                        <Settings className="w-5 h-5 mr-3" />Settings
                      </Button>
                      <Button onClick={() => setMenuPage("inventory")} variant="outline" className="w-full h-14 border-stone-300 hover:bg-stone-50 text-stone-700 rounded-lg font-medium justify-start text-base">
                        <Package className="w-5 h-5 mr-3" />Inventory Management
                      </Button>
                    </div>
                  )}

                  {menuPage === "settings" && (
                    <>
                      <div className="mb-4">
                        <Card className="bg-white shadow-sm border border-stone-200 rounded-xl p-4">
                          <div className="mb-4">
                            <h2 className="text-lg font-bold text-stone-800 mb-1">User Access Control</h2>
                            <p className="text-xs text-stone-600">Manage shop users</p>
                          </div>
                          
                          <Button onClick={fetchUsers} disabled={loadingUsers} variant="outline" className="w-full h-11 mb-4 border-stone-300 text-stone-700 rounded-lg">
                            <RefreshCw className={`w-4 h-4 mr-2 ${loadingUsers ? 'animate-spin' : ''}`} /> Refresh Users
                          </Button>

                          {loadingUsers ? (
                            <div className="py-4 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-700" /></div>
                          ) : (
                            <div className="space-y-3">
                              {users.map(u => (
                                <div key={u.id} className="bg-stone-50 border border-stone-200 p-3 rounded-lg flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-bold text-stone-800">{u.displayName || u.username}</p>
                                    <p className="text-xs text-stone-500">{u.role} • {u.isActive ? "Active" : "Inactive"}</p>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button onClick={() => handleResetPassword(u)} size="sm" variant="outline" className="h-8 px-2 text-xs">Reset Pwd</Button>
                                    <Button onClick={() => handleToggleUserStatus(u)} disabled={isUpdatingUser === u.id} size="sm" variant="outline" className={`h-8 px-2 text-xs ${u.isActive ? 'text-red-600' : 'text-green-600'}`}>
                                      {u.isActive ? "Disable" : "Enable"}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </Card>
                      </div>

                      <div className="mb-4">
                        <Card className="bg-white shadow-sm border border-stone-200 rounded-xl p-4">
                          <div className="mb-4">
                            <h2 className="text-lg font-bold text-stone-800 mb-1">Payment Settings</h2>
                            <p className="text-xs text-stone-600">Configure UPI details.</p>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <Label htmlFor="upiId" className="text-sm font-medium text-stone-700 mb-1.5 block">UPI ID</Label>
                              <Input id="upiId" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="example@upi" className="h-11 bg-white rounded-lg" />
                            </div>
                            <Button onClick={handleSavePaymentSettings} disabled={isSavingPayment || loadingPayment} className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                              {isSavingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Payment Settings"}
                            </Button>
                          </div>
                        </Card>
                      </div>
                    </>
                  )}

                  {menuPage === "inventory" && (
                    <div className="mb-4">
                      <Card className="bg-white shadow-sm border border-stone-200 rounded-xl p-4">
                        <div className="mb-4"><p className="text-xs text-stone-600">Track stock and edit items.</p></div>

                        <div className="space-y-3 mb-4">
                          <div>
                            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search products..." className="h-11 rounded-lg" />
                          </div>
                        </div>

                        <div className="space-y-3">
                          {loadingInventory ? (
                            <div className="py-4 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-700" /></div>
                          ) : (
                            filteredInventory.map(product => (
                              <div key={product._id} className={`border rounded-lg p-3 ${!product.isActive ? 'bg-stone-100 opacity-70' : 'bg-stone-50'}`}>
                                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                  <div><p className="font-bold text-stone-500 mb-0.5">NAME</p><p className="font-medium text-stone-800">{product.name}</p></div>
                                  <div><p className="font-bold text-stone-500 mb-0.5">BARCODE</p><p className="font-medium text-stone-800">{product.barcode}</p></div>
                                  <div><p className="font-bold text-stone-500 mb-0.5">PRICE</p><p className="font-medium text-stone-800">₹{product.price}</p></div>
                                  <div>
                                    <p className="font-bold text-stone-500 mb-0.5">STOCK</p>
                                    <div className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded w-fit font-bold">{product.stock}</div>
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <Button onClick={() => handleEditProduct(product)} variant="outline" size="sm" className="text-xs h-8"><Edit className="w-3 h-3 mr-1" />Edit</Button>
                                  <Button onClick={() => handleAddStock(product, 10)} disabled={updatingStockId === product._id} variant="outline" size="sm" className="text-xs h-8">+10 Stock</Button>
                                  <Button onClick={() => handleDeactivateProduct(product)} variant="outline" size="sm" className="text-xs h-8">
                                    <Archive className="w-3 h-3 mr-1" />{product.isActive ? "Deactivate" : "Activate"}
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </Card>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
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

      {/* Reset Password Modal */}
      <Dialog open={isResetModalOpen} onOpenChange={setIsResetModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-stone-600">Enter new password for <strong>{resetTargetUser?.username}</strong></p>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setIsResetModalOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={submitResetPassword}>Reset Password</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ScannerModal 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
        onScan={(text) => {
           setBarcode(text);
           setIsScannerOpen(false);
        }} 
      />
    </div>
  );
}
