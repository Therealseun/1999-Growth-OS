export type UserRole = "ADMIN" | "MANAGER" | "EMPLOYEE";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string | null;
};

export type Campaign = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  niche: string;
  offer: string;
  location: string;
  objective: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  departmentId: string;
  departmentName?: string;
  prospectCount?: number | null;
  taskCount?: number | null;
};

export type Prospect = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  company?: string | null;
  role?: string | null;
  source?: string | null;
  campaignId?: string | null;
  status: "QUALIFIED" | "REJECTED" | "NEEDS_REVIEW";
  notes?: string | null;
  createdAt: string;
  website?: string | null;
  location?: string | null;
};

export type Task = {
  id: string;
  type: "EMAIL" | "SEO" | "LEAD_MAGNET";
  title: string;
  description?: string | null;
  status: "READY" | "REVIEWED" | "SENT" | "PUBLISHED" | "POSTED" | "SKIPPED" | "INVALID" | "EXPIRED";
  assignedTo: string;
  /** Display name resolved server-side from assignedTo (falls back to the id). */
  assignedToName?: string;
  assignedBy?: string | null;
  assignedByName?: string | null;
  campaignId?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  createdAt: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | null;
};

export type Evidence = {
  id: string;
  taskId: string;
  workstream: "EMAIL" | "SEO" | "LEAD_MAGNET";
  type: "URL" | "TEXT" | "FILE";
  evidenceValue?: string | null;
  storagePath?: string | null;
  submittedAt: string;
  submittedBy: string;
};

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  type: string;
  createdAt: string;
  createdBy: string;
};

export type EmailDraft = {
  id: string;
  subject: string;
  body: string;
  status: "DRAFT" | "SENT";
  campaignId: string | null;
  prospectIds: string[];
  sentAt: string | null;
  createdAt: string;
  createdBy: string;
};

export type LeadMagnet = {
  id: string;
  name: string;
  type: string;
  description: string;
  content?: string | null;
  status: string;
  campaignId: string | null;
  createdBy: string;
  createdAt: string;
};

export type WorkloadTarget = {
  id: string;
  campaignId: string | null;
  campaignName?: string | null;
  emailDailyTarget: number;
  seoDailyTarget: number;
  leadMagnetDailyTarget: number;
  workdaysPerMonth: number;
  effectiveFrom: string;
  updatedAt: string;
  updatedBy?: string | null;
};

export type WorkloadSnapshot = {
  id: string;
  campaignId: string;
  campaignName: string;
  userId: string;
  employeeName: string;
  workDate: string;
  emailTarget: number;
  seoTarget: number;
  leadMagnetTarget: number;
  emailCompleted: number;
  seoCompleted: number;
  leadMagnetCompleted: number;
  totalCompleted: number;
  completionPct: number | null;
  generatedAt: string;
};

export type CampaignMetrics = {
  prospectCount: number;
  contactedCount: number;
  qualifiedCount: number;
  convertedCount: number | null;
  tasksCompleted: number;
  tasksTotal: number;
  emailsSent?: number | null;
  leadsGenerated?: number | null;
  rejectedCount?: number;
  needsReviewCount?: number;
};

export type DashboardStats = {
  campaignsCount: number;
  activeCampaignsCount: number;
  prospectsCount: number;
  tasksCount: number;
  completedTasksCount: number;
  pendingTasksCount: number;
  conversionRate?: number | null;
  revenueOpportunity?: number | null;
};

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};
