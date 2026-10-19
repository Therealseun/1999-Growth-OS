// API client configuration
// All endpoints live under /api. The base URL is configurable via environment
// variable and defaults to the current origin for local dev.
const getBaseUrl = (): string => {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window === "undefined") return "http://localhost:3000/api";
  return `${window.location.origin}/api`;
};

const BASE_URL = getBaseUrl();

type RefreshResponse = {
  access_token: string;
  refresh_token: string;
};

let refreshInFlight: Promise<void> | null = null;

async function throwApiError(response: Response): Promise<never> {
  let errorBody: {
    code?: string;
    message?: string;
    details?: unknown;
    error?: { code?: string; message?: string; details?: unknown };
  } = {};
  try {
    errorBody = await response.json();
  } catch {
    errorBody = { message: response.statusText };
  }
  const body = errorBody.error ?? errorBody;
  const error = new Error(
    String(body.message ?? response.statusText ?? "Request failed")
  ) as Error & { code: string; details?: unknown; status: number };
  error.code = String(body.code ?? response.status);
  error.details = body.details;
  error.status = response.status;
  throw error;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) return throwApiError(response);
  if (response.status === 204) return undefined as T;
  return response.json();
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("growthos_auth_token");
}

function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token === null) {
    clearTokens();
    return;
  }
  localStorage.setItem("growthos_auth_token", token);
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("growthos_refresh_token");
}

function setTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("growthos_auth_token", accessToken);
  localStorage.setItem("growthos_refresh_token", refreshToken);
}

function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("growthos_auth_token");
  localStorage.removeItem("growthos_refresh_token");
  window.dispatchEvent(new Event("growthos:unauthorized"));
}

async function refreshTokens(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    throw new Error("Your session has expired. Please sign in again.");
  }

  refreshInFlight = (async () => {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) clearTokens();
      await throwApiError(response);
    }
    const session = (await response.json()) as Partial<RefreshResponse>;
    if (
      typeof session.access_token !== "string" ||
      !session.access_token ||
      typeof session.refresh_token !== "string" ||
      !session.refresh_token
    ) {
      throw new Error("The session refresh response was invalid.");
    }
    setTokens(session.access_token, session.refresh_token);
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

async function fetchApiResponse(path: string, options: RequestInit): Promise<Response> {
  const send = () => {
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    const token = getAuthToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    else headers.delete("Authorization");

    return fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });
  };

  let response = await send();
  const isAuthEndpoint = /^\/auth\/(login|signup|refresh)$/.test(path);
  if (response.status === 401 && !isAuthEndpoint) {
    if (getRefreshToken()) {
      await refreshTokens();
      response = await send();
    } else {
      clearTokens();
    }
    if (response.status === 401) clearTokens();
  }
  return response;
}

export const apiClient = {
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetchApiResponse(path, options);
    return handleResponse<T>(response);
  },

  async get<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: "GET" });
  },

  async post<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  async put<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  async patch<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  async delete<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: "DELETE" });
  },

  async getBlob(path: string): Promise<Blob> {
    const response = await fetchApiResponse(path, {
      method: "GET",
      headers: { Accept: "text/csv, application/json" },
    });
    if (!response.ok) return throwApiError(response);
    return response.blob();
  },

  getToken: getAuthToken,
  setToken: setAuthToken,
  getRefreshToken,
  setTokens,
  clearTokens,
};
