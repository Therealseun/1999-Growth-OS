"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authApi, type LoginResponse } from "@/lib/auth.api";
import { getCurrentProfile, profileToUser } from "@/lib/supabase-data";
import { getSupabaseClient } from "@/lib/supabase";
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
    } catch {
      setUser(null);
      throw new Error("Could not refresh your account. Please sign in again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let supabase: ReturnType<typeof getSupabaseClient>;
    try { supabase = getSupabaseClient(); } catch {
      setIsLoading(false);
      return;
    }
    let version=0;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const current=++version;
      window.setTimeout(() => {
        void (async () => {
          try {
            const profile = session ? await getCurrentProfile() : null;
            if (!cancelled && current===version) setUser(profile ? profileToUser(profile) : null);
          } catch {
            if (!cancelled && current===version) setUser(null);
          } finally {
            if (!cancelled && current===version) setIsLoading(false);
          }
        })();
      }, 0);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
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
