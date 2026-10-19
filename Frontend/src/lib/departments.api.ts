import { apiClient } from "./api";

export type Department = { id: string; name: string };

export const departmentsApi = {
  async list() {
    return apiClient.get<{ data: Department[] }>("/departments");
  },

  async create(name: string) {
    return apiClient.post<{ data: Department }>("/departments", { name });
  },
};
