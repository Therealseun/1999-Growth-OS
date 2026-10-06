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
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED";
  niche: string;
  targetAudience: string;
  objective: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  prospectCount?: number | null;
  taskCount?: number | null;
};

export type Prospect = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company?: string | null;
  role?: string | null;
  source?: string | null;
  campaignId?: string | null;
  status: "SEED" | "CONTACTED" | "QUALIFIED" | "CONVERTED";
  notes?: string | null;
  createdAt: string;
};

export type Task = {
  id: string;
  type: "EMAIL" | "SEO" | "LEAD_MAGNET";
  title: string;
  description?: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED";
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
  type: "LINK" | "SCREENSHOT" | "NOTE" | "FILE";
  title: string;
  url?: string | null;
  metadata?: string | null;
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
  downloadCount: number;
  conversionRate: number;
  createdAt: string;
};

export type WorkloadTarget = {
  id: string;
  role: UserRole;
  dailyTaskTarget: number;
  weeklyTaskTarget: number;
  activeCampaignsTarget?: number | null;
  updatedAt: string;
  updatedBy?: string | null;
};

export type WorkloadSnapshot = {
  id: string;
  userId: string;
  period: "TODAY" | "THIS_WEEK" | "THIS_MONTH";
  tasksCompleted: number;
  tasksAssigned: number;
  targetSnapshot: {
    dailyTaskTarget: number;
    weeklyTaskTarget: number;
    activeCampaignsTarget: number | null;
  };
  capturedAt: string;
};

export type CampaignMetrics = {
  prospectCount: number;
  contactedCount: number;
  qualifiedCount: number;
  convertedCount: number;
  tasksCompleted: number;
  tasksTotal: number;
  emailsSent?: number | null;
  leadsGenerated?: number | null;
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
