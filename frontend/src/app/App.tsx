import React, { useState } from "react";
import { motion } from "motion/react";
import { ShoppingCart, User, Lock, Eye, EyeOff, Zap, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import POSPage from "./components/POSPage";
import AdminPage from "./components/AdminPage";
import ReportsPage from "./components/ReportsPage";
import SalesPage from "./components/SalesPage";
import { useAuth } from "../context/AuthContext";

export default function App() {
  const { isLoggedIn, isLoading, error, login, bootstrapAdmin, clearError, user } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [currentPage, setCurrentPage] = useState("pos");

  // Login form state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Register form state
  const [regShopName, setRegShopName] = useState("");
  const [regOwnerName, setRegOwnerName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearError();

    if (!username.trim() || !password) {
      setFormError("Please enter username and password");
      return;
    }

    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err: any) {
      setFormError(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearError();

    if (!regShopName.trim() || !regOwnerName.trim() || !regPhone.trim() || !regEmail.trim()) {
      setFormError("All fields are required");
      return;
    }
    if (!regUsername.trim() || !regPassword) {
      setFormError("Username and password are required");
      return;
    }
    if (regPassword.length < 8) {
      setFormError("Password must be at least 8 characters");
      return;
    }

    setSubmitting(true);
    try {
      await bootstrapAdmin({
        username: regUsername.trim(),
        password: regPassword,
        displayName: regOwnerName.trim(),
        name: regShopName.trim(),
        ownerName: regOwnerName.trim(),
        phone: regPhone.trim(),
        email: regEmail.trim(),
      });
    } catch (err: any) {
      setFormError(err.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Show loading spinner on initial auth check
  if (isLoading && !submitting) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-amber-700 animate-spin" />
          <p className="text-sm text-stone-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show appropriate page if user is logged in
  if (isLoggedIn) {
    if (currentPage === "admin") {
      return <AdminPage onTabChange={setCurrentPage} />;
    }
    if (currentPage === "reports") {
      return <ReportsPage onTabChange={setCurrentPage} />;
    }
    if (currentPage === "sales") {
      return <SalesPage onTabChange={setCurrentPage} />;
    }
    return <POSPage onTabChange={setCurrentPage} />;
  }

  const displayError = formError || error;

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col lg:flex-row font-sans">
      {/* Left side - Professional Brand Section */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="hidden lg:flex flex-1 bg-gradient-to-br from-stone-800 via-stone-700 to-stone-600 text-white p-12 flex-col justify-between relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="p-2.5 bg-amber-700 rounded-xl">
              <ShoppingCart className="w-7 h-7 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-white">CounterCraft</span>
          </div>

          <div>
            <h1 className="text-4xl font-bold mb-4 leading-tight text-white">
              Professional POS System
            </h1>
            <p className="text-base text-stone-300 max-w-md leading-relaxed">
              Enterprise-grade point-of-sale solution for retail businesses.
              Streamline operations with powerful tools and real-time analytics.
            </p>
          </div>
        </div>

        <div className="relative z-10">
          <div className="grid grid-cols-2 gap-4 text-sm text-stone-300">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              <span>Secure & Encrypted</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              <span>High Performance</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Right side - Clean Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-100/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md relative z-10"
        >
          {/* Mobile branding */}
          <div className="lg:hidden mb-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="p-2 bg-amber-700 rounded-xl">
                <ShoppingCart className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-stone-800">CounterCraft</h1>
            </div>
            <p className="text-sm text-stone-600">Professional POS System</p>
          </div>

          {/* Error display */}
          {displayError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{displayError}</p>
            </div>
          )}

          {isLogin ? (
            <>
              <form onSubmit={handleLogin}>
                <div className="bg-white rounded-2xl shadow-lg border border-stone-200 p-8">
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold text-stone-800 mb-2 hidden lg:block">Sign In</h2>
                    <p className="text-sm text-stone-600">
                      Access your account to continue
                    </p>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <Label htmlFor="username" className="mb-2 block text-sm font-medium text-stone-700">
                        Username
                      </Label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2">
                          <User className="h-5 w-5 text-stone-400" />
                        </div>
                        <Input
                          id="username"
                          type="text"
                          placeholder="Enter username"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          disabled={submitting}
                          className="pl-11 h-12 bg-white border-stone-300 focus:border-amber-700 focus:ring-amber-700/10 rounded-lg"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="password" className="mb-2 block text-sm font-medium text-stone-700">
                        Password
                      </Label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2">
                          <Lock className="h-5 w-5 text-stone-400" />
                        </div>
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={submitting}
                          className="pl-11 pr-11 h-12 bg-white border-stone-300 focus:border-amber-700 focus:ring-amber-700/10 rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
                        >
                          {showPassword ? (
                            <EyeOff className="h-5 w-5" />
                          ) : (
                            <Eye className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={submitting}
                      className="w-full h-12 bg-amber-700 hover:bg-amber-800 text-white shadow-sm rounded-lg font-medium"
                    >
                      {submitting ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing In...</>
                      ) : (
                        "Sign In"
                      )}
                    </Button>
                  </div>

                  <div className="mt-6 pt-6 border-t border-stone-200">
                    <p className="text-center text-sm text-stone-600">
                      First time setup?{" "}
                      <button
                        type="button"
                        onClick={() => { setIsLogin(false); setFormError(null); clearError(); }}
                        className="text-amber-700 hover:text-amber-800 font-medium transition-colors"
                      >
                        Create Admin Account
                      </button>
                    </p>
                  </div>
                </div>
              </form>
            </>
          ) : (
            <>
              <form onSubmit={handleRegister}>
                <div className="bg-white rounded-2xl shadow-lg border border-stone-200 p-8">
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold text-stone-800 mb-2">New Shop Setup</h2>
                    <p className="text-sm text-stone-600">
                      Create your first admin account to get started
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="shopName" className="mb-2 block text-sm font-medium text-stone-700">
                        Shop Name
                      </Label>
                      <Input
                        id="shopName"
                        type="text"
                        placeholder="e.g. Sunrise Mart"
                        value={regShopName}
                        onChange={(e) => setRegShopName(e.target.value)}
                        disabled={submitting}
                        className="h-11 bg-white border-stone-300 focus:border-amber-700 focus:ring-amber-700/10 rounded-lg"
                      />
                    </div>

                    <div>
                      <Label htmlFor="ownerName" className="mb-2 block text-sm font-medium text-stone-700">
                        Owner Name
                      </Label>
                      <Input
                        id="ownerName"
                        type="text"
                        placeholder="e.g. John Doe"
                        value={regOwnerName}
                        onChange={(e) => setRegOwnerName(e.target.value)}
                        disabled={submitting}
                        className="h-11 bg-white border-stone-300 focus:border-amber-700 focus:ring-amber-700/10 rounded-lg"
                      />
                    </div>

                    <div>
                      <Label htmlFor="phone" className="mb-2 block text-sm font-medium text-stone-700">
                        Phone Number
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="e.g. +919876543210"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        disabled={submitting}
                        className="h-11 bg-white border-stone-300 focus:border-amber-700 focus:ring-amber-700/10 rounded-lg"
                      />
                    </div>

                    <div>
                      <Label htmlFor="email" className="mb-2 block text-sm font-medium text-stone-700">
                        Email
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="e.g. owner@shop.com"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        disabled={submitting}
                        className="h-11 bg-white border-stone-300 focus:border-amber-700 focus:ring-amber-700/10 rounded-lg"
                      />
                    </div>

                    <div className="pt-4 border-t border-stone-200">
                      <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3">Admin Credentials</p>
                    </div>

                    <div>
                      <Label htmlFor="regUsername" className="mb-2 block text-sm font-medium text-stone-700">
                        Username
                      </Label>
                      <Input
                        id="regUsername"
                        type="text"
                        placeholder="Choose a username"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                        disabled={submitting}
                        className="h-11 bg-white border-stone-300 focus:border-amber-700 focus:ring-amber-700/10 rounded-lg"
                      />
                    </div>

                    <div>
                      <Label htmlFor="regPassword" className="mb-2 block text-sm font-medium text-stone-700">
                        Password
                      </Label>
                      <Input
                        id="regPassword"
                        type="password"
                        placeholder="Min 8 characters (letters + numbers)"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        disabled={submitting}
                        className="h-11 bg-white border-stone-300 focus:border-amber-700 focus:ring-amber-700/10 rounded-lg"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={submitting}
                      className="w-full h-12 bg-amber-700 hover:bg-amber-800 text-white shadow-sm rounded-lg font-medium mt-6"
                    >
                      {submitting ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</>
                      ) : (
                        "Create Admin Account"
                      )}
                    </Button>
                  </div>

                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={() => { setIsLogin(true); setFormError(null); clearError(); }}
                      className="text-sm text-amber-700 hover:text-amber-800 transition-colors font-medium"
                    >
                      ← Back to Sign In
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}