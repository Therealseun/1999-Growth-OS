import { apiClient } from "./api";
import type { UserRole } from "./types";

type BackendProfile = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: "PENDING" | "ACTIVE" | "DISABLED";
  department_id: string | null;
};

type BackendAuthResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  profile: BackendProfile;
};

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
  name: string;
  email: string;
  role: "EMPLOYEE";
  status: "PENDING";
  department_id: null;
  message: string;
};

function profileToUser(profile: BackendProfile) {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    avatarUrl: null,
  };
}

function establishSession(session: BackendAuthResponse): void {
  apiClient.setTokens(session.access_token, session.refresh_token);
}

export const authApi = {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    const session = await apiClient.post<BackendAuthResponse>("/auth/login", {
      email: payload.email.trim(),
      password: payload.password,
    });
    establishSession(session);
    return {
      user: profileToUser(session.profile),
      token: session.access_token,
      expiresIn: session.expires_in,
    };
  },

  async logout() {
    apiClient.clearTokens();
  },

  async register(payload: RegisterRequest): Promise<RegisterResponse> {
    return apiClient.post<RegisterResponse>("/auth/signup", {
      name: payload.name.trim(),
      email: payload.email.trim(),
      password: payload.password,
    });
  },

  async getCurrentUser() {
    try {
      const profile = await apiClient.get<BackendProfile>("/auth/me");
      return { user: profileToUser(profile) };
    } catch (error) {
      if (error instanceof Error && "status" in error) {
        const status = (error as Error & { status: number }).status;
        if (status === 401 || status === 403) apiClient.clearTokens();
      }
      throw error;
    }
  },

  clearSession() {
    apiClient.clearTokens();
  },
};
