import { apiClient } from "./api";
import type { UserRole } from "./types";

type EmployeeRow = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: "PENDING" | "ACTIVE" | "DISABLED";
  department_id: string | null;
  department_name?: string | null;
  created_at: string;
};

function mapEmployee(profile: EmployeeRow) {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    active: profile.status === "ACTIVE",
    status: profile.status,
    departmentId: profile.department_id,
    departmentName: profile.department_name ?? null,
    createdAt: profile.created_at,
  };
}

function queryString(query?: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.size ? `?${params}` : "";
}

export const employeesApi = {
  async list(query?: { role?: string; search?: string; page?: number; pageSize?: number }) {
    const result = await apiClient.get<{ data: EmployeeRow[]; total: number; page: number; pageSize: number }>(
      `/employees${queryString(query)}`
    );
    return { ...result, data: result.data.map(mapEmployee) };
  },

  async get(id: string) {
    const result = await apiClient.get<{ data: EmployeeRow }>(`/employees/${id}`);
    return { data: mapEmployee(result.data) };
  },

  async create(payload: { email: string; name: string; role: UserRole; departmentId?: string }) {
    const result = await apiClient.post<{ data: EmployeeRow }>("/employees", payload);
    return { data: mapEmployee(result.data) };
  },

  async update(id: string, payload: Partial<{
    name: string;
    role: UserRole;
    departmentId: string | null;
    status: "PENDING" | "ACTIVE" | "DISABLED";
  }>) {
    const result = await apiClient.patch<{ data: EmployeeRow }>(`/employees/${id}`, payload);
    return { data: mapEmployee(result.data) };
  },

  async deactivate(id: string) {
    return apiClient.delete<{ data: { deactivated: boolean } }>(`/employees/${id}`);
  },

  async getPerformance(id: string, query?: { period?: string }) {
    return apiClient.get<{ data: Array<{
      period: string;
      tasksCompleted: number;
      tasksTotal: number;
      completionRate: number;
      averageTimeToComplete: number;
      evidenceSubmitted: number;
      rating: null;
    }> }>(`/employees/${id}/performance${queryString(query)}`);
  },
};
