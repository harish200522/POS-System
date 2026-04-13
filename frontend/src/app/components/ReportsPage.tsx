import React, { useState, useEffect, useCallback } from "react";
import {
  ShoppingBag,
  Home,
  BarChart3,
  Wifi,
  Clock,
  TrendingUp,
  Calendar,
  AlertTriangle,
  Package,
  Download,
  History,
  Loader2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { api, downloadFile } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { getLastSyncTimestamp } from "../../services/storage";

interface ReportsPageProps {
  onTabChange?: (tab: string) => void;
}

export default function ReportsPage({ onTabChange }: ReportsPageProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("reports");
  const [timePeriod, setTimePeriod] = useState("daily");
  
  // Need to use proper ISO dates for API if sending from/to, but backend getSalesSummary supports range="daily"|"weekly"|"monthly" directly.
  
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getSalesSummary({ range: timePeriod });
      if (res.success) {
        setSummary(res.data);
      }
    } catch {
      // fallback or ignore
    } finally {
      setLoading(false);
    }
  }, [timePeriod]);

  useEffect(() => {
    fetchSummary();
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [fetchSummary]);

  const overview = summary?.overview || { totalRevenue: 0, totalTransactions: 0 };
  const lowStockCount = summary?.lowStockCount || 0;
  const paymentBreakdown = summary?.paymentBreakdown || [];
  const topProducts = summary?.topProducts || [];
  const trend = summary?.trend || [];

  return (
    <div className="min-h-screen bg-stone-50 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>

      <div className="relative z-10 pb-24 px-4 sm:px-6 lg:px-8 pt-4 max-w-md sm:max-w-2xl lg:max-w-5xl xl:max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <div className="bg-gradient-to-br from-white via-blue-50 to-amber-50 rounded-2xl shadow-lg border-2 border-blue-200 p-5 lg:p-6">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-blue-100 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-blue-700" />
                </div>
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                  RETAIL BILLING SUITE
                </p>
              </div>
              <h1 className="text-2xl font-bold text-stone-900 mb-1">
                Reports & Analytics
              </h1>
              <p className="text-xs text-stone-600">
                Track sales performance and business insights.
              </p>
            </div>

            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className={`flex items-center gap-1.5 ${isOnline ? 'bg-gradient-to-r from-green-600 to-green-700' : 'bg-gradient-to-r from-red-500 to-red-600'} text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md`}>
                <Wifi className="w-3.5 h-3.5" />
                {isOnline ? "Online" : "Offline"}
              </div>
              <div className="flex items-center gap-1.5 bg-white border-2 border-stone-200 text-stone-700 px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm">
                <Clock className="w-3.5 h-3.5 text-amber-700" />
                Last sync: {getLastSyncTimestamp() || "never"}
              </div>
            </div>

            <div>
              <span className="text-sm font-semibold text-stone-700">Account: {user?.displayName || user?.username}</span>
            </div>
          </div>
        </div>

        {/* Dashboard Section */}
        <div className="mb-4">
          <Card className="bg-white shadow-sm border border-stone-200 rounded-xl p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-stone-800 mb-1">Sales Dashboard</h2>
                <p className="text-xs text-stone-600">Analytics and product trends.</p>
              </div>
              {loading && <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />}
            </div>

            <div className="flex gap-2 mb-4">
              {["daily", "weekly", "monthly"].map(p => (
                <button
                  key={p}
                  onClick={() => setTimePeriod(p)}
                  className={`flex-1 h-10 rounded-lg font-medium text-sm transition-all capitalize ${
                    timePeriod === p
                      ? "bg-white border-2 border-blue-600 text-amber-700"
                      : "bg-white border-2 border-stone-300 text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3">
              <button
                onClick={() => downloadFile("/reports/export/csv", "reports.csv", { range: timePeriod })}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-95 text-sm cursor-pointer"
              >
                <Download className="w-5 h-5" /> Download CSV
              </button>
              <button
                onClick={() => downloadFile("/reports/export/pdf", "reports.pdf", { range: timePeriod })}
                className="w-full py-3.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-95 text-sm cursor-pointer"
              >
                <Download className="w-5 h-5" /> Download PDF
              </button>
            </div>
          </Card>
        </div>

        {/* Stats Grid */}
        <div className="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 shadow-md border-2 border-green-200 rounded-xl p-4 hover:shadow-lg transition-shadow">
            <div className="p-2.5 bg-gradient-to-br from-green-600 to-green-700 rounded-xl shadow-md w-fit mb-3">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <p className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-1.5">Revenue</p>
            <p className="text-3xl font-bold text-green-900 mb-1">₹{overview.totalRevenue.toLocaleString()}</p>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 shadow-md border-2 border-blue-200 rounded-xl p-4 hover:shadow-lg transition-shadow">
            <div className="p-2.5 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-md w-fit mb-3">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-1.5">Orders</p>
            <p className="text-3xl font-bold text-blue-900 mb-1">{overview.totalTransactions}</p>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-violet-50 shadow-md border-2 border-purple-200 rounded-xl p-4 hover:shadow-lg transition-shadow">
            <div className="p-2.5 bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl shadow-md w-fit mb-3">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider mb-1.5">Avg Ticket</p>
            <p className="text-3xl font-bold text-purple-900 mb-1">
              ₹{overview.totalTransactions > 0 ? Math.round(overview.totalRevenue / overview.totalTransactions).toLocaleString() : 0}
            </p>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-orange-50 shadow-md border-2 border-amber-200 rounded-xl p-4 hover:shadow-lg transition-shadow">
            <div className="p-2.5 bg-gradient-to-br from-amber-600 to-orange-600 rounded-xl shadow-md w-fit mb-3">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1.5">Low Stock</p>
            <p className="text-3xl font-bold text-amber-900 mb-1">{lowStockCount}</p>
          </Card>
        </div>

        {/* Payment Breakdown */}
        <div className="mb-4">
          <Card className="bg-white shadow-sm border border-stone-200 rounded-xl p-4">
            <h3 className="text-base font-bold text-stone-800 mb-3">Payment Distribution</h3>
            {paymentBreakdown.length === 0 ? (
              <p className="text-sm text-stone-500">No payment data available in this period.</p>
            ) : (
              <div className="space-y-3">
                {paymentBreakdown.map((pb: any) => (
                  <div key={pb._id} className="flex items-center justify-between bg-stone-50 p-2 rounded border border-stone-200">
                    <span className="font-semibold text-stone-700 capitalize">{pb._id}</span>
                    <span className="font-bold text-stone-900">₹{pb.amount.toLocaleString()} <span className="text-stone-500 text-xs ml-2">({pb.count} txns)</span></span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Top Products */}
        <div className="mb-4">
          <Card className="bg-white shadow-sm border border-stone-200 rounded-xl p-4">
            <h3 className="text-base font-bold text-stone-800 mb-3">Products Sold</h3>
            {topProducts.length === 0 ? (
              <p className="text-sm text-stone-500">No product sales data in this period.</p>
            ) : (
              <div className="space-y-3">
                {topProducts.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-stone-50 p-2 rounded border border-stone-200">
                    <div>
                      <p className="font-bold text-sm text-stone-800">{p._id.name}</p>
                      <p className="text-xs text-stone-500">{p._id.barcode}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm text-stone-900">₹{p.revenue.toLocaleString()}</p>
                      <p className="text-xs font-semibold text-blue-600">{p.quantitySold} sold</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
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
