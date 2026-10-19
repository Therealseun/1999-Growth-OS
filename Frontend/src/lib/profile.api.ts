import { apiClient } from "./api";
import type { UserRole } from "./types";

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  status: "PENDING" | "ACTIVE" | "DISABLED";
  department_id: string | null;
};

type BackendProfile = Omit<ProfileRow, "full_name" | "active"> & { name: string };

export async function getCurrentProfile(): Promise<ProfileRow> {
  const profile = await apiClient.get<BackendProfile>("/auth/me");
  if (profile.status !== "ACTIVE") {
    apiClient.clearTokens();
    throw new Error("This account is inactive. Contact your administrator.");
  }
  return {
    ...profile,
    full_name: profile.name,
    active: profile.status === "ACTIVE",
  };
}

export async function updateCurrentProfileName(name: string): Promise<void> {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 120) {
    throw new Error("Enter a name between 1 and 120 characters.");
  }
  await apiClient.patch("/auth/me", { name: normalizedName });
}

export function profileToUser(profile: ProfileRow) {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.full_name,
    role: profile.role,
    avatarUrl: null,
  };
}
