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

async function throwApiError(response: Response): Promise<never> {
  let errorBody: { code?: string; message?: string; details?: unknown } = {};
  try {
    errorBody = await response.json();
  } catch {
    errorBody = { message: response.statusText };
  }
  const error = new Error(
    String(errorBody.message ?? response.statusText ?? "Request failed")
  ) as Error & { code: string; details?: unknown };
  error.code = String(errorBody.code ?? response.status);
  error.details = errorBody.details;
  throw error;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      // Token expired or invalid — clear it so the auth provider reverts to signed-out.
      setAuthToken(null);
    }
    return throwApiError(response);
  }

  // Handle no-content responses
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("growthos_auth_token");
}

function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token === null) {
    localStorage.removeItem("growthos_auth_token");
    window.dispatchEvent(new Event("growthos:unauthorized"));
    return;
  }
  localStorage.setItem("growthos_auth_token", token);
}

export const apiClient = {
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = getAuthToken();
    const headers: HeadersInit = {
      ...options.headers,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (token) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });

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
    const headers = new Headers({ Accept: "text/csv, application/json" });
    const token = getAuthToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${BASE_URL}${path}`, {
      method: "GET",
      headers,
      credentials: "include",
    });
    if (!response.ok) {
      if (response.status === 401) setAuthToken(null);
      return throwApiError(response);
    }
    return response.blob();
  },

  getToken: getAuthToken,
  setToken: setAuthToken,
};
