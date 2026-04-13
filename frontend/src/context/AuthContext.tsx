import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { setLastSyncTimestamp } from "../services/storage";

interface User {
  id: string;
  username: string;
  displayName: string;
  shopId: string;
  role: "admin" | "cashier";
  isActive: boolean;
  lastLoginAt?: string;
  createdAt?: string;
}

interface Shop {
  id: string;
  name: string;
  ownerName: string;
  phone: string;
  email: string;
}

interface AuthState {
  user: User | null;
  shop: Shop | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  bootstrapAdmin: (data: {
    username: string;
    password: string;
    displayName?: string;
    name: string;
    ownerName: string;
    phone: string;
    email: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    shop: null,
    isLoggedIn: false,
    isLoading: true,
    error: null,
  });

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const result = await api.getCurrentUser();
      if (result.success && result.data?.user) {
        setState({
          user: result.data.user,
          shop: result.data.shop || null,
          isLoggedIn: true,
          isLoading: false,
          error: null,
        });
      } else {
        setState({ user: null, shop: null, isLoggedIn: false, isLoading: false, error: null });
      }
    } catch {
      setState({ user: null, shop: null, isLoggedIn: false, isLoading: false, error: null });
    }
  }, []);

  useEffect(() => {
    checkAuth();

    const handleUnauthorized = () => {
      setState({ user: null, shop: null, isLoggedIn: false, isLoading: false, error: null });
    };

    window.addEventListener("pos:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("pos:unauthorized", handleUnauthorized);
  }, [checkAuth]);

  const login = useCallback(async (username: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const result = await api.login({ username, password });
      if (result.success && result.data?.user) {
        setLastSyncTimestamp();
        setState({
          user: result.data.user,
          shop: result.data.shop || null,
          isLoggedIn: true,
          isLoading: false,
          error: null,
        });
      }
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err.message || "Login failed",
      }));
      throw err;
    }
  }, []);

  const bootstrapAdmin = useCallback(
    async (data: {
      username: string;
      password: string;
      displayName?: string;
      name: string;
      ownerName: string;
      phone: string;
      email: string;
    }) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const result = await api.bootstrapAdmin(data);
        if (result.success && result.data?.user) {
          setLastSyncTimestamp();
          setState({
            user: result.data.user,
            shop: result.data.shop || null,
            isLoggedIn: true,
            isLoading: false,
            error: null,
          });
        }
      } catch (err: any) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err.message || "Registration failed",
        }));
        throw err;
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    setState({ user: null, shop: null, isLoggedIn: false, isLoading: false, error: null });
  }, []);

  return (
    <AuthContext.Provider
      value={{ ...state, login, bootstrapAdmin, logout, clearError, checkAuth }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
