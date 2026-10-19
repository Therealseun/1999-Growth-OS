"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authApi, type LoginResponse } from "@/lib/auth.api";
import { apiClient } from "@/lib/api";
import type { UserRole } from "@/lib/types";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string | null;
};

type AuthState = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshUser = useCallback(async () => {
    try {
      const data = await authApi.getCurrentUser();
      setUser(data.user);
    } catch (error) {
      setUser(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const handleUnauthorized = () => {
      if (!cancelled) {
        setUser(null);
        setIsLoading(false);
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "growthos_auth_token" && event.newValue) {
        setIsLoading(true);
        void authApi.getCurrentUser()
          .then(({ user: currentUser }) => {
            if (!cancelled) setUser(currentUser);
          })
          .catch(() => {
            if (!cancelled) setUser(null);
          })
          .finally(() => {
            if (!cancelled) setIsLoading(false);
          });
      } else if (
        (event.key === "growthos_auth_token" || event.key === "growthos_refresh_token") &&
        event.newValue === null
      ) {
        handleUnauthorized();
      }
    };
    window.addEventListener("growthos:unauthorized", handleUnauthorized);
    window.addEventListener("storage", handleStorage);

    if (!apiClient.getToken() && !apiClient.getRefreshToken()) {
      void Promise.resolve().then(() => {
        if (!cancelled) setIsLoading(false);
      });
    } else {
      void authApi.getCurrentUser()
        .then(({ user: currentUser }) => {
          if (!cancelled) setUser(currentUser);
        })
        .catch(() => {
          if (!cancelled) setUser(null);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("growthos:unauthorized", handleUnauthorized);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login({ email, password });
    setUser(data.user);
    setIsLoading(false);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value: AuthState = {
    user,
    isLoading,
    isAuthenticated: user !== null,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
