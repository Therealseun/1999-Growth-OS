import { getCurrentProfile, profileToUser } from "./supabase-data";
import { getSupabaseClient } from "./supabase";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: "ADMIN" | "MANAGER" | "EMPLOYEE";
    avatarUrl?: string | null;
  };
  token: string;
  expiresIn: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export type RegisterResponse = {
  userId: string;
  email: string;
  requiresEmailConfirmation: boolean;
};

export const authApi = {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: payload.email.trim(),
      password: payload.password,
    });
    if (error) throw error;
    if (!data.session) throw new Error("Sign-in did not return an active session.");

    try {
      const profile = await getCurrentProfile();
      return {
        user: profileToUser(profile),
        token: data.session.access_token,
        expiresIn: data.session.expires_in ?? 0,
      };
    } catch (profileError) {
      await supabase.auth.signOut();
      throw profileError;
    }
  },

  async logout() {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) throw error;
  },

  async register(payload: RegisterRequest): Promise<RegisterResponse> {
    const { data, error } = await getSupabaseClient().auth.signUp({
      email: payload.email.trim(),
      password: payload.password,
      options: { data: { full_name: payload.name.trim() } },
    });
    if (error) throw error;
    if (!data.user) throw new Error("Supabase did not return the created user.");

    return {
      userId: data.user.id,
      email: data.user.email ?? payload.email.trim(),
      requiresEmailConfirmation: data.session === null,
    };
  },

  async getCurrentUser() {
    return { user: profileToUser(await getCurrentProfile()) };
  },
};
