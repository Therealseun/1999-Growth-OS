// GrowthOS API handlers.
// One dispatcher for the catch-all /api/[[...path]] route. Every endpoint is
// authenticated server-side and role-checked here — the backend is authoritative.
import { ApiError, createUser, issueToken, login, requireRole, requireUser, currentUser } from "./auth";
import { getDb, hashPassword, id, saveDb, type ServerUser } from "./store";
import type {
  Campaign,
  CampaignMetrics,
  DashboardStats,
  Evidence,
  Prospect,
  Task,
  WorkloadTarget,
} from "@/lib/types";

type Json = Record<string, unknown>;

function ok(data: unknown, init?: ResponseInit): Response {
  return Response.json({ data }, init);
}

function fail(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ code: error.code, message: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Internal server error";
  return Response.json({ code: "INTERNAL", message }, { status: 500 });
}

function publicUser(u: ServerUser) {
  const { passwordHash, ...rest } = u;
  void passwordHash;
  return rest;
}

async function body(req: Request): Promise<Json> {
  try {
    const parsed = await req.json();
    return typeof parsed === "object" && parsed !== null ? (parsed as Json) : {};
  } catch {
    return {};
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function optionalStr(v: unknown): string | undefined {
  const s = str(v);
  return s.length > 0 ? s : undefined;
}

function pageOf<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return { data: items.slice(start, start + pageSize), total: items.length, page, pageSize };
}

function notFound(what: string): ApiError {
  return new ApiError(404, "NOT_FOUND", `${what} not found.`);
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------------------
// Derived data helpers
// ---------------------------------------------------------------------------

function prospectCountFor(campaignId: string): number {
  return getDb().prospects.filter((p) => p.campaignId === campaignId).length;
}

function taskCountFor(campaignId: string): number {
  return getDb().tasks.filter((t) => t.campaignId === campaignId).length;
}

function withCounts(campaign: Campaign): Campaign {
  return {
    ...campaign,
    prospectCount: prospectCountFor(campaign.id),
    taskCount: taskCountFor(campaign.id),
  };
}

type TaskView = Task & { assignedToName: string; assignedByName: string | null };

/** Decorate tasks with human-readable assignee/assigner names for the UI. */
function withAssignee(task: Task): TaskView {
  const db = getDb();
  const assignee = db.users.find((u) => u.id === task.assignedTo);
  const assigner = db.users.find((u) => u.id === task.assignedBy);
  return {
    ...task,
    assignedToName: assignee?.name ?? task.assignedTo,
    assignedByName: assigner?.name ?? null,
  };
}

function campaignMetrics(campaignId: string): CampaignMetrics {
  const db = getDb();
  const prospects = db.prospects.filter((p) => p.campaignId === campaignId);
  const tasks = db.tasks.filter((t) => t.campaignId === campaignId);
  const byStatus = (s: Prospect["status"]) => prospects.filter((p) => p.status === s).length;
  const tasksCompleted = tasks.filter((t) => t.status === "COMPLETED").length;
  const emailsSent = db.emailDrafts.filter(
    (d) => d.status === "SENT" && d.campaignId === campaignId
  ).length;
  const leadsGenerated = db.leadMagnets
    .filter((l) => l.campaignId === campaignId)
    .reduce((sum, l) => sum + l.downloadCount, 0);
  return {
    prospectCount: prospects.length,
    contactedCount: byStatus("CONTACTED") + byStatus("QUALIFIED") + byStatus("CONVERTED"),
    qualifiedCount: byStatus("QUALIFIED") + byStatus("CONVERTED"),
    convertedCount: byStatus("CONVERTED"),
    tasksCompleted,
    tasksTotal: tasks.length,
    emailsSent,
    leadsGenerated,
  };
}

function dashboardStats(user: ServerUser): DashboardStats {
  const db = getDb();
  const isEmployee = user.role === "EMPLOYEE";
  const myTasks = isEmployee ? db.tasks.filter((t) => t.assignedTo === user.id) : db.tasks;
  const tasksCount = myTasks.length;
  const completedTasksCount = myTasks.filter((t) => t.status === "COMPLETED").length;
  const pendingTasksCount = myTasks.filter(
    (t) => t.status === "PENDING" || t.status === "IN_PROGRESS"
  ).length;
  const prospects = db.prospects;
  const converted = prospects.filter((p) => p.status === "CONVERTED").length;
  const qualified = prospects.filter((p) => p.status === "QUALIFIED").length;
  const conversionRate =
    prospects.length > 0 ? Math.round((converted / prospects.length) * 1000) / 10 : null;
  // Estimated pipeline value: derived from qualified/converted volume, never hardcoded.
  const revenueOpportunity =
    prospects.length > 0 ? (qualified * 2 + converted * 5) * 1500 : null;

  return {
    campaignsCount: db.campaigns.length,
    activeCampaignsCount: db.campaigns.filter((c) => c.status === "ACTIVE").length,
    prospectsCount: prospects.length,
    tasksCount,
    completedTasksCount,
    pendingTasksCount,
    conversionRate,
    revenueOpportunity,
  };
}

type PerformanceRecord = {
  period: string;
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  averageTimeToComplete: number;
  evidenceSubmitted: number;
  rating: number | null;
};

function performanceFor(user: ServerUser, period: "TODAY" | "THIS_WEEK" | "THIS_MONTH"): PerformanceRecord {
  const db = getDb();
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const windowDays = period === "TODAY" ? 1 : period === "THIS_WEEK" ? 7 : 30;
  const start = now - windowDays * DAY;
  const relevant = db.tasks.filter(
    (t) => t.assignedTo === user.id && new Date(t.createdAt).getTime() >= start
  );
  const completed = relevant.filter((t) => t.status === "COMPLETED");
  const durations = completed
    .map((t) =>
      t.completedAt ? (new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000 : null
    )
    .filter((d): d is number => d != null && d >= 0);
  const averageTimeToComplete =
    durations.length > 0
      ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
      : 0;
  const tasksTotal = relevant.length;
  const completionRate = tasksTotal > 0 ? Math.round((completed.length / tasksTotal) * 1000) / 10 : 0;
  const evidenceSubmitted = db.evidence.filter(
    (e) => e.submittedBy === user.id && new Date(e.submittedAt).getTime() >= start
  ).length;
  const roleTarget = db.targets.find((t) => t.role === user.role);
  const target = period === "TODAY" ? roleTarget?.dailyTaskTarget : roleTarget?.weeklyTaskTarget;
  const rating =
    target && target > 0
      ? Math.min(5, Math.max(1, Math.round((completed.length / target) * 5 * 10) / 10))
      : null;

  return {
    period,
    tasksCompleted: completed.length,
    tasksTotal,
    completionRate,
    averageTimeToComplete,
    evidenceSubmitted,
    rating,
  };
}

function performanceRecords(user: ServerUser, period?: string): PerformanceRecord[] {
  const periods: ("TODAY" | "THIS_WEEK" | "THIS_MONTH")[] =
    period === "TODAY" || period === "THIS_WEEK" || period === "THIS_MONTH"
      ? [period]
      : ["TODAY", "THIS_WEEK", "THIS_MONTH"];
  return periods.map((p) => performanceFor(user, p));
}

function taskDistribution(user: ServerUser) {
  const db = getDb();
  const tasks =
    user.role === "EMPLOYEE" ? db.tasks.filter((t) => t.assignedTo === user.id) : db.tasks;
  const byStatus = {
    COMPLETED: tasks.filter((t) => t.status === "COMPLETED").length,
    IN_PROGRESS: tasks.filter((t) => t.status === "IN_PROGRESS").length,
    PENDING: tasks.filter((t) => t.status === "PENDING").length,
    BLOCKED: tasks.filter((t) => t.status === "BLOCKED").length,
  };
  return [
    { name: "Completed", value: byStatus.COMPLETED, count: byStatus.COMPLETED },
    { name: "In progress", value: byStatus.IN_PROGRESS, count: byStatus.IN_PROGRESS },
    { name: "Pending", value: byStatus.PENDING, count: byStatus.PENDING },
    { name: "Blocked", value: byStatus.BLOCKED, count: byStatus.BLOCKED },
  ];
}

function currentTargetFor(role: WorkloadTarget["role"]): WorkloadTarget {
  const db = getDb();
  const existing = db.targets.find((t) => t.role === role);
  if (existing) return existing;
  // No admin-configured target yet — return an explicit zeroed record so the UI
  // shows empty inputs instead of inventing numbers.
  return {
    id: id("wlt"),
    role,
    dailyTaskTarget: 0,
    weeklyTaskTarget: 0,
    activeCampaignsTarget: null,
    updatedAt: new Date(0).toISOString(),
  };
}

function requireCampaign(campaignId: string): Campaign {
  const campaign = getDb().campaigns.find((c) => c.id === campaignId);
  if (!campaign) throw notFound("Campaign");
  return campaign;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function dispatch(req: Request, method: string, path: string[]): Promise<Response> {
  try {
    const url = new URL(req.url);
    const q = url.searchParams;
    const [root, p1, p2] = path;

    switch (root) {
      // ---------------------------- auth -----------------------------------
      case "auth": {
        if (p1 === "login" && method === "POST") {
          const b = await body(req);
          const result = login(str(b.email), str(b.password));
          return Response.json({
            user: publicUser(result.user),
            token: result.token,
            expiresIn: result.expiresIn,
          });
        }
        if (p1 === "me" && method === "GET") {
          const user = requireUser(req);
          return Response.json({ user: publicUser(user) });
        }
        if (p1 === "logout" && method === "POST") {
          // Stateless tokens: the client discards its copy. Accept and return 204.
          return new Response(null, { status: 204 });
        }
        if (p1 === "refresh" && method === "POST") {
          const b = await body(req);
          const user = currentUser(req);
          if (!user && !str(b.refreshToken)) {
            throw new ApiError(401, "UNAUTHORIZED", "No token to refresh.");
          }
          const active = user ?? requireUser(req);
          const { token, expiresIn } = issueToken(active);
          return Response.json({ token, expiresIn });
        }
        if (p1 === "register" && method === "POST") {
          const b = await body(req);
          const email = str(b.email).toLowerCase();
          const name = str(b.name);
          const password = str(b.password);
          if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || !password) {
            throw new ApiError(400, "VALIDATION", "A valid email, name and password are required.");
          }
          if (name.length > 120 || email.length > 254 || password.length < 8) {
            throw new ApiError(
              400,
              "VALIDATION",
              "Name and email must be within length limits, and password must be at least 8 characters."
            );
          }
          const created = createUser({
            email,
            name,
            role: "EMPLOYEE",
            password,
          });
          return Response.json({ userId: created.id, email: created.email }, { status: 201 });
        }
        if (p1 === "verify" && method === "POST") {
          requireUser(req);
          return Response.json({ verified: true });
        }
        break;
      }

      // -------------------------- campaigns --------------------------------
      case "campaigns": {
        if (!p1 && method === "GET") {
          // Read access for all roles: employee workspaces (SEO, lead magnets)
          // scope their data by campaign. Writes remain manager/admin only.
          requireUser(req);
          const search = (q.get("search") ?? "").toLowerCase();
          const status = q.get("status") ?? "";
          const page = Number(q.get("page") ?? 1) || 1;
          const pageSize = Number(q.get("pageSize") ?? 50) || 50;
          const filtered = getDb().campaigns
            .filter(
              (c) =>
                (!status || c.status === status) &&
                (!search ||
                  c.name.toLowerCase().includes(search) ||
                  c.niche.toLowerCase().includes(search) ||
                  c.targetAudience.toLowerCase().includes(search))
            )
            .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
            .map(withCounts);
          return Response.json(pageOf(filtered, page, pageSize));
        }
        if (!p1 && method === "POST") {
          requireRole(req, ["ADMIN", "MANAGER"]);
          const user = requireUser(req);
          const b = await body(req);
          const name = str(b.name);
          const niche = str(b.niche);
          const targetAudience = str(b.targetAudience);
          if (!name || !niche || !targetAudience) {
            throw new ApiError(400, "VALIDATION", "Name, niche and target audience are required.");
          }
          const now = new Date().toISOString();
          const campaign: Campaign = {
            id: id("cmp"),
            name,
            niche,
            targetAudience,
            objective: str(b.objective),
            status: "DRAFT",
            createdAt: now,
            updatedAt: now,
            ownerId: user.id,
          };
          getDb().campaigns.unshift(campaign);
          saveDb();
          return ok(withCounts(campaign), { status: 201 });
        }
        if (p1 === "bulk" && method === "POST") break; // no bulk campaign ops in V1

        const campaignId = p1 as string;
        if (p2 === "niche-intelligence" && method === "GET") {
          requireUser(req);
          const campaign = requireCampaign(campaignId);
          const stored = getDb().intelligence[campaign.id];
          const data = stored ?? {
            niche: campaign.niche,
            insights: [],
            opportunities: [],
            risks: [],
            competitors: [],
          };
          return ok(data);
        }
        if (p2 === "metrics" && method === "GET") {
          requireUser(req);
          requireCampaign(campaignId);
          return ok(campaignMetrics(campaignId));
        }
        if (!p2 && method === "GET") {
          requireUser(req);
          return ok(withCounts(requireCampaign(campaignId)));
        }
        if (!p2 && method === "PATCH") {
          requireRole(req, ["ADMIN", "MANAGER"]);
          const campaign = requireCampaign(campaignId);
          const b = await body(req);
          const allowed = ["name", "niche", "targetAudience", "objective", "status"] as const;
          for (const key of allowed) {
            const value = b[key];
            if (typeof value === "string" && value.length > 0) {
              (campaign as unknown as Json)[key] = value;
            }
          }
          campaign.updatedAt = new Date().toISOString();
          saveDb();
          return ok(withCounts(campaign));
        }
        if (!p2 && method === "DELETE") {
          requireRole(req, ["ADMIN"]);
          const db = getDb();
          const index = db.campaigns.findIndex((c) => c.id === campaignId);
          if (index < 0) throw notFound("Campaign");
          db.campaigns.splice(index, 1);
          saveDb();
          return new Response(null, { status: 204 });
        }
        break;
      }

      // -------------------------- prospects --------------------------------
      case "prospects": {
        if (p1 === "bulk-import" && method === "POST") {
          requireRole(req, ["ADMIN", "MANAGER"]);
          const b = await body(req);
          const emails = Array.isArray(b.emails) ? (b.emails as unknown[]).map(str).filter(Boolean) : [];
          const db = getDb();
          let imported = 0;
          let failed = 0;
          for (const email of emails) {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || db.prospects.some((p) => p.email === email)) {
              failed++;
              continue;
            }
            const [local] = email.split("@");
            db.prospects.push({
              id: id("prs"),
              firstName: local.slice(0, 1).toUpperCase() + local.slice(1),
              lastName: "",
              email,
              company: null,
              role: null,
              source: "Bulk import",
              campaignId: optionalStr(b.campaignId) ?? null,
              status: "SEED",
              notes: null,
              createdAt: new Date().toISOString(),
            });
            imported++;
          }
          saveDb();
          return ok({ imported, failed });
        }
        if (!p1 && method === "GET") {
          requireRole(req, ["ADMIN", "MANAGER"]);
          const search = (q.get("search") ?? "").toLowerCase();
          const status = q.get("status") ?? "";
          const campaignId = q.get("campaignId") ?? "";
          const page = Number(q.get("page") ?? 1) || 1;
          const pageSize = Number(q.get("pageSize") ?? 50) || 50;
          const filtered = getDb()
            .prospects.filter(
              (p) =>
                (!status || p.status === status) &&
                (!campaignId || p.campaignId === campaignId) &&
                (!search ||
                  `${p.firstName} ${p.lastName}`.toLowerCase().includes(search) ||
                  p.email.toLowerCase().includes(search) ||
                  (p.company ?? "").toLowerCase().includes(search))
            )
            .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
          return Response.json(pageOf(filtered, page, pageSize));
        }
        if (!p1 && method === "POST") {
          requireRole(req, ["ADMIN", "MANAGER"]);
          const b = await body(req);
          const firstName = str(b.firstName);
          const lastName = str(b.lastName);
          const email = str(b.email);
          if (!firstName || !email) {
            throw new ApiError(400, "VALIDATION", "First name and email are required.");
          }
          const db = getDb();
          if (db.prospects.some((p) => p.email.toLowerCase() === email.toLowerCase())) {
            throw new ApiError(409, "DUPLICATE", "A prospect with that email already exists.");
          }
          const prospect: Prospect = {
            id: id("prs"),
            firstName,
            lastName,
            email,
            company: optionalStr(b.company) ?? null,
            role: optionalStr(b.role) ?? null,
            source: optionalStr(b.source) ?? "Manual",
            campaignId: optionalStr(b.campaignId) ?? null,
            status: (str(b.status) as Prospect["status"]) || "SEED",
            notes: optionalStr(b.notes) ?? null,
            createdAt: new Date().toISOString(),
          };
          db.prospects.unshift(prospect);
          saveDb();
          return ok(prospect, { status: 201 });
        }
        const prospectId = p1 as string;
        if (!p2 && method === "GET") {
          requireRole(req, ["ADMIN", "MANAGER"]);
          const prospect = getDb().prospects.find((p) => p.id === prospectId);
          if (!prospect) throw notFound("Prospect");
          return ok(prospect);
        }
        if (!p2 && method === "PATCH") {
          requireRole(req, ["ADMIN", "MANAGER"]);
          const prospect = getDb().prospects.find((p) => p.id === prospectId);
          if (!prospect) throw notFound("Prospect");
          const b = await body(req);
          const allowed = ["firstName", "lastName", "email", "company", "role", "status", "notes"] as const;
          for (const key of allowed) {
            const value = b[key];
            if (typeof value === "string" && value.length > 0) {
              (prospect as unknown as Json)[key] = value;
            }
          }
          saveDb();
          return ok(prospect);
        }
        if (!p2 && method === "DELETE") {
          requireRole(req, ["ADMIN", "MANAGER"]);
          const db = getDb();
          const index = db.prospects.findIndex((p) => p.id === prospectId);
          if (index < 0) throw notFound("Prospect");
          db.prospects.splice(index, 1);
          saveDb();
          return new Response(null, { status: 204 });
        }
        break;
      }

      // ---------------------------- tasks ----------------------------------
      case "tasks": {
        if (p1 === "me" && method === "GET") {
          const user = requireUser(req);
          const status = q.get("status") ?? "";
          const type = q.get("type") ?? "";
          const page = Number(q.get("page") ?? 1) || 1;
          const pageSize = Number(q.get("pageSize") ?? 50) || 50;
          const items = getDb()
            .tasks.filter(
              (t) =>
                t.assignedTo === user.id &&
                (!status || t.status === status) &&
                (!type || t.type === type)
            )
            .sort((a, b) => +new Date(a.dueDate ?? b.createdAt) - +new Date(b.dueDate ?? a.createdAt));
          return Response.json(pageOf(items.map(withAssignee), page, pageSize));
        }
        if (p1 === "team" && method === "GET") {
          requireRole(req, ["ADMIN", "MANAGER"]);
          const status = q.get("status") ?? "";
          const type = q.get("type") ?? "";
          const page = Number(q.get("page") ?? 1) || 1;
          const pageSize = Number(q.get("pageSize") ?? 50) || 50;
          const items = getDb()
            .tasks.filter((t) => (!status || t.status === status) && (!type || t.type === type))
            .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
          return Response.json(pageOf(items.map(withAssignee), page, pageSize));
        }
        if (!p1 && method === "GET") {
          requireRole(req, ["ADMIN", "MANAGER"]);
          const status = q.get("status") ?? "";
          const type = q.get("type") ?? "";
          const assignedTo = q.get("assignedTo") ?? "";
          const campaignId = q.get("campaignId") ?? "";
          const page = Number(q.get("page") ?? 1) || 1;
          const pageSize = Number(q.get("pageSize") ?? 50) || 50;
          const items = getDb()
            .tasks.filter(
              (t) =>
                (!status || t.status === status) &&
                (!type || t.type === type) &&
                (!assignedTo || t.assignedTo === assignedTo) &&
                (!campaignId || t.campaignId === campaignId)
            )
            .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
          return Response.json(pageOf(items.map(withAssignee), page, pageSize));
        }
        if (!p1 && method === "POST") {
          requireRole(req, ["ADMIN", "MANAGER"]);
          const user = requireUser(req);
          const b = await body(req);
          const title = str(b.title);
          const type = str(b.type);
          if (!title || !["EMAIL", "SEO", "LEAD_MAGNET"].includes(type)) {
            throw new ApiError(400, "VALIDATION", "A title and a valid task type are required.");
          }
          const db = getDb();
          const assigneeId = optionalStr(b.assignedTo);
          if (assigneeId && !db.users.some((u) => u.id === assigneeId && u.active)) {
            throw new ApiError(400, "VALIDATION", "Assignee does not exist.");
          }
          const campaignId = optionalStr(b.campaignId);
          if (campaignId) requireCampaign(campaignId);
          const task: Task = {
            id: id("tsk"),
            type: type as Task["type"],
            title,
            description: optionalStr(b.description) ?? null,
            status: "PENDING",
            assignedTo: assigneeId ?? db.users.find((u) => u.role === "EMPLOYEE" && u.active)?.id ?? user.id,
            assignedBy: user.id,
            campaignId: campaignId ?? null,
            dueDate: optionalStr(b.dueDate) ?? null,
            completedAt: null,
            createdAt: new Date().toISOString(),
            priority: (str(b.priority) as Task["priority"]) || "MEDIUM",
          };
          db.tasks.unshift(task);
          saveDb();
          return ok(task, { status: 201 });
        }

        const taskId = p1 as string;
        if (p2 === "evidence" && method === "GET") {
          const user = requireUser(req);
          const task = getDb().tasks.find((t) => t.id === taskId);
          if (!task) throw notFound("Task");
          if (user.role === "EMPLOYEE" && task.assignedTo !== user.id) {
            throw new ApiError(403, "FORBIDDEN", "You can only view evidence for your own tasks.");
          }
          const items = getDb().evidence.filter((e) => e.taskId === taskId);
          return ok(items);
        }
        if (p2 === "evidence" && method === "POST") {
          const user = requireUser(req);
          const db = getDb();
          const task = db.tasks.find((t) => t.id === taskId);
          if (!task) throw notFound("Task");
          if (user.role === "EMPLOYEE" && task.assignedTo !== user.id) {
            throw new ApiError(403, "FORBIDDEN", "You can only submit evidence for your own tasks.");
          }
          const b = await body(req);
          const type = str(b.type);
          const title = str(b.title);
          if (!["LINK", "SCREENSHOT", "NOTE", "FILE"].includes(type) || !title) {
            throw new ApiError(400, "VALIDATION", "Evidence type and title are required.");
          }
          const evidence: Evidence = {
            id: id("evd"),
            taskId,
            type: type as Evidence["type"],
            title,
            url: optionalStr(b.url) ?? null,
            metadata: optionalStr(b.metadata) ?? null,
            submittedAt: new Date().toISOString(),
            submittedBy: user.id,
          };
          db.evidence.push(evidence);
          // Submitting evidence completes the human-executed task and records it.
          if (task.status !== "COMPLETED") {
            task.status = "COMPLETED";
            task.completedAt = evidence.submittedAt;
          }
          saveDb();
          return ok(evidence, { status: 201 });
        }
        if (!p2 && method === "GET") {
          const user = requireUser(req);
          const task = getDb().tasks.find((t) => t.id === taskId);
          if (!task) throw notFound("Task");
          if (user.role === "EMPLOYEE" && task.assignedTo !== user.id) {
            throw new ApiError(403, "FORBIDDEN", "You can only view your own tasks.");
          }
          return ok(task);
        }
        if (!p2 && method === "PATCH") {
          const user = requireUser(req);
          const task = getDb().tasks.find((t) => t.id === taskId);
          if (!task) throw notFound("Task");
          const isAssignee = task.assignedTo === user.id;
          const canManage = user.role === "ADMIN" || user.role === "MANAGER";
          if (!isAssignee && !canManage) {
            throw new ApiError(403, "FORBIDDEN", "You can only update your own tasks.");
          }
          const b = await body(req);
          if (typeof b.status === "string") {
            const allowedStatuses: Task["status"][] = ["PENDING", "IN_PROGRESS", "COMPLETED", "BLOCKED"];
            if (!allowedStatuses.includes(b.status as Task["status"])) {
              throw new ApiError(400, "VALIDATION", "Invalid task status.");
            }
            task.status = b.status as Task["status"];
            task.completedAt =
              task.status === "COMPLETED" ? task.completedAt ?? new Date().toISOString() : null;
          }
          if (typeof b.title === "string" && b.title.trim()) task.title = b.title.trim();
          if (typeof b.description === "string") task.description = b.description;
          if (typeof b.priority === "string" && b.priority) task.priority = b.priority as Task["priority"];
          if (typeof b.dueDate === "string") task.dueDate = b.dueDate || null;
          saveDb();
          return ok(task);
        }
        if (!p2 && method === "DELETE") {
          requireRole(req, ["ADMIN"]);
          const db = getDb();
          const index = db.tasks.findIndex((t) => t.id === taskId);
          if (index < 0) throw notFound("Task");
          db.tasks.splice(index, 1);
          saveDb();
          return new Response(null, { status: 204 });
        }
        break;
      }

      // -------------------------- employees --------------------------------
      case "employees": {
        if (!p1 && method === "GET") {
          requireRole(req, ["ADMIN", "MANAGER"]);
          const search = (q.get("search") ?? "").toLowerCase();
          const role = q.get("role") ?? "";
          const page = Number(q.get("page") ?? 1) || 1;
          const pageSize = Number(q.get("pageSize") ?? 50) || 50;
          const items = getDb()
            .users.filter(
              (u) =>
                (!role || u.role === role) &&
                (!search || u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search))
            )
            .map((u) => ({ ...publicUser(u), workload: currentTargetFor(u.role) }));
          return Response.json(pageOf(items, page, pageSize));
        }
        if (!p1 && method === "POST") {
          requireRole(req, ["ADMIN"]);
          const b = await body(req);
          const email = str(b.email);
          const name = str(b.name);
          if (!email || !name) throw new ApiError(400, "VALIDATION", "Email and name are required.");
          const created = createUser({
            email,
            name,
            role: (str(b.role) || "EMPLOYEE") as ServerUser["role"],
            password: str(b.password) || undefined,
          });
          return ok({ ...publicUser(created), workload: currentTargetFor(created.role) }, { status: 201 });
        }
        const employeeId = p1 as string;
        if (!p2 && method === "GET") {
          const user = requireUser(req);
          if (user.role !== "ADMIN" && user.id !== employeeId) {
            throw new ApiError(403, "FORBIDDEN", "You can only view your own profile.");
          }
          const found = getDb().users.find((u) => u.id === employeeId);
          if (!found) throw notFound("Employee");
          return ok({ ...publicUser(found), workload: currentTargetFor(found.role) });
        }
        if (!p2 && method === "PATCH") {
          requireRole(req, ["ADMIN"]);
          const found = getDb().users.find((u) => u.id === employeeId);
          if (!found) throw notFound("Employee");
          const b = await body(req);
          if (typeof b.name === "string" && b.name.trim()) found.name = b.name.trim();
          if (typeof b.role === "string" && ["ADMIN", "MANAGER", "EMPLOYEE"].includes(b.role)) {
            found.role = b.role as ServerUser["role"];
          }
          if (typeof b.avatarUrl === "string") found.avatarUrl = b.avatarUrl || null;
          saveDb();
          return ok({ ...publicUser(found), workload: currentTargetFor(found.role) });
        }
        if (p2 === "deactivate" && method === "POST") {
          requireRole(req, ["ADMIN"]);
          const found = getDb().users.find((u) => u.id === employeeId);
          if (!found) throw notFound("Employee");
          if (found.id === requireUser(req).id) {
            throw new ApiError(400, "VALIDATION", "You cannot deactivate your own account.");
          }
          found.active = false;
          saveDb();
          return ok({ deactivated: true });
        }
        if (p2 === "performance" && method === "GET") {
          const user = requireUser(req);
          if (user.role !== "ADMIN" && user.id !== employeeId) {
            throw new ApiError(403, "FORBIDDEN", "You can only view your own performance.");
          }
          const found = getDb().users.find((u) => u.id === employeeId);
          if (!found) throw notFound("Employee");
          return ok(performanceRecords(found, q.get("period") ?? ""));
        }
        break;
      }

      // --------------------------- reports ---------------------------------
      case "reports": {
        if (p1 === "dashboard" && method === "GET") {
          const user = requireUser(req);
          const db = getDb();
          const stats = dashboardStats(user);
          const recentCampaigns = db.campaigns
            .slice()
            .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
            .slice(0, 5)
            .map(withCounts);
          const recentProspects = db.prospects.slice(0, 5);
          return Response.json({
            data: { stats, recentCampaigns, recentProspects, taskDistribution: taskDistribution(user) },
          });
        }
        if (p1 === "my-performance" && method === "GET") {
          const user = requireUser(req);
          return ok(performanceRecords(user, q.get("period") ?? ""));
        }
        if (p1 === "generate" && method === "POST") {
          requireRole(req, ["ADMIN", "MANAGER"]);
          const user = requireUser(req);
          const b = await body(req);
          const type = str(b.type);
          if (!["PIPELINE", "PERFORMANCE", "TASK_AUDIT"].includes(type)) {
            throw new ApiError(400, "VALIDATION", "Choose a supported report type.");
          }
          const format = str(b.format) || "CSV";
          if (!["CSV", "JSON"].includes(format)) {
            throw new ApiError(400, "VALIDATION", "Choose CSV or JSON format.");
          }
          const reportId = id("rpt");
          const record = {
            id: reportId,
            type,
            campaignId: optionalStr(b.campaignId) ?? null,
            dateFrom: optionalStr(b.dateFrom) ?? null,
            dateTo: optionalStr(b.dateTo) ?? null,
            format,
            status: "READY",
            downloadUrl: `/api/reports/${reportId}/download`,
            createdAt: new Date().toISOString(),
            createdBy: user.id,
          };
          getDb().reports.unshift(record);
          saveDb();
          return Response.json(
            { data: { reportId: record.id, downloadUrl: record.downloadUrl, status: record.status } },
            { status: 201 }
          );
        }
        if (!p1 && method === "GET") {
          requireRole(req, ["ADMIN", "MANAGER"]);
          const type = q.get("type") ?? "";
          const campaignId = q.get("campaignId") ?? "";
          const page = Number(q.get("page") ?? 1) || 1;
          const pageSize = Number(q.get("pageSize") ?? 50) || 50;
          const items = getDb().reports.filter(
            (r) => (!type || r.type === type) && (!campaignId || r.campaignId === campaignId)
          );
          return Response.json(pageOf(items, page, pageSize));
        }
        const reportId = p1 as string;
        if (p2 === "download" && method === "GET") {
          requireRole(req, ["ADMIN", "MANAGER"]);
          const report = getDb().reports.find((r) => r.id === reportId);
          if (!report) throw notFound("Report");

          const db = getDb();
          const inDateRange = (date: string) =>
            (!report.dateFrom || date >= report.dateFrom) &&
            (!report.dateTo || date <= `${report.dateTo}T23:59:59.999Z`);
          let headers: string[];
          let rows: unknown[][];

          if (report.type === "PIPELINE") {
            headers = ["Campaign", "Status", "Niche", "Target audience", "Prospects", "Qualified", "Converted", "Tasks completed", "Tasks total"];
            rows = db.campaigns
              .filter((campaign) => !report.campaignId || campaign.id === report.campaignId)
              .map((campaign) => {
                const metrics = campaignMetrics(campaign.id);
                return [
                  campaign.name,
                  campaign.status,
                  campaign.niche,
                  campaign.targetAudience,
                  metrics.prospectCount,
                  metrics.qualifiedCount,
                  metrics.convertedCount,
                  metrics.tasksCompleted,
                  metrics.tasksTotal,
                ];
              });
          } else if (report.type === "PERFORMANCE") {
            headers = ["Employee", "Email", "Role", "Tasks completed", "Tasks assigned", "Completion rate", "Evidence submitted"];
            rows = db.users
              .filter((employee) => employee.active)
              .map((employee) => {
                const tasks = db.tasks.filter(
                  (task) =>
                    task.assignedTo === employee.id &&
                    (!report.campaignId || task.campaignId === report.campaignId) &&
                    inDateRange(task.createdAt)
                );
                const completed = tasks.filter((task) => task.status === "COMPLETED").length;
                const evidenceCount = db.evidence.filter(
                  (evidence) =>
                    evidence.submittedBy === employee.id && inDateRange(evidence.submittedAt)
                ).length;
                return [
                  employee.name,
                  employee.email,
                  employee.role,
                  completed,
                  tasks.length,
                  tasks.length > 0 ? Math.round((completed / tasks.length) * 1000) / 10 : 0,
                  evidenceCount,
                ];
              });
          } else {
            headers = ["Task", "Type", "Status", "Priority", "Assignee", "Campaign", "Due date", "Created"];
            rows = db.tasks
              .filter(
                (task) =>
                  (!report.campaignId || task.campaignId === report.campaignId) &&
                  inDateRange(task.createdAt)
              )
              .map((task) => [
                task.title,
                task.type,
                task.status,
                task.priority,
                db.users.find((employee) => employee.id === task.assignedTo)?.name ?? task.assignedTo,
                db.campaigns.find((campaign) => campaign.id === task.campaignId)?.name ?? "",
                task.dueDate,
                task.createdAt,
              ]);
          }

          const filename = `growthos-${report.type.toLowerCase()}-${report.id}.${report.format.toLowerCase()}`;
          const content = report.format === "JSON"
            ? JSON.stringify({ report, columns: headers, rows }, null, 2)
            : [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
          return new Response(content, {
            headers: {
              "Content-Type": report.format === "JSON" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename="${filename}"`,
              "Cache-Control": "no-store",
            },
          });
        }
        if (!p2 && method === "GET") {
          requireRole(req, ["ADMIN", "MANAGER"]);
          const found = getDb().reports.find((r) => r.id === reportId);
          if (!found) throw notFound("Report");
          return ok(found);
        }
        break;
      }

      // --------------------------- workload --------------------------------
      case "workload": {
        if (p1 === "targets" && method === "GET") {
          requireRole(req, ["ADMIN"]);
          const db = getDb();
          const data = (["ADMIN", "MANAGER", "EMPLOYEE"] as const).map((role) => {
            const existing = db.targets.find((t) => t.role === role);
            return existing ?? currentTargetFor(role);
          });
          return ok(data);
        }
        if (p1 === "targets" && p2 && method === "PUT") {
          requireRole(req, ["ADMIN"]);
          const role = p2 as WorkloadTarget["role"];
          if (!["ADMIN", "MANAGER", "EMPLOYEE"].includes(role)) {
            throw new ApiError(400, "VALIDATION", "Unknown role.");
          }
          const b = await body(req);
          const daily = Number(b.dailyTaskTarget);
          const weekly = Number(b.weeklyTaskTarget);
          const campaignsTarget = b.activeCampaignsTarget;
          if (!Number.isFinite(daily) || daily < 0 || !Number.isFinite(weekly) || weekly < 0) {
            throw new ApiError(400, "VALIDATION", "Targets must be non-negative numbers.");
          }
          const db = getDb();
          const user = requireUser(req);
          let target = db.targets.find((t) => t.role === role);
          if (!target) {
            target = { id: id("wlt"), role, dailyTaskTarget: 0, weeklyTaskTarget: 0, activeCampaignsTarget: null, updatedAt: "" };
            db.targets.push(target);
          }
          target.dailyTaskTarget = Math.round(daily);
          target.weeklyTaskTarget = Math.round(weekly);
          target.activeCampaignsTarget =
            campaignsTarget === undefined || campaignsTarget === null || campaignsTarget === ""
              ? null
              : Math.max(0, Math.round(Number(campaignsTarget)) || 0);
          target.updatedAt = new Date().toISOString();
          target.updatedBy = user.id;
          saveDb();
          return ok(target);
        }
        if (p1 === "snapshots" && method === "GET") {
          requireRole(req, ["ADMIN", "MANAGER"]);
          const period = q.get("period") ?? "";
          const items = getDb()
            .snapshots.filter((s) => !period || s.period === period)
            .sort((a, b) => +new Date(b.capturedAt) - +new Date(a.capturedAt));
          return ok(items);
        }
        if (p1 === "snapshots" && p2 && method === "GET") {
          const user = requireUser(req);
          if (user.role !== "ADMIN" && user.id !== p2) {
            throw new ApiError(403, "FORBIDDEN", "You can only view your own workload snapshots.");
          }
          const period = q.get("period") ?? "";
          const items = getDb()
            .snapshots.filter((s) => s.userId === p2 && (!period || s.period === period))
            .sort((a, b) => +new Date(b.capturedAt) - +new Date(a.capturedAt));
          return ok(items);
        }
        if (p1 === "users" && p2 && method === "GET") {
          const user = requireUser(req);
          if (user.role !== "ADMIN" && user.id !== p2) {
            throw new ApiError(403, "FORBIDDEN", "You can only view your own workload.");
          }
          const found = getDb().users.find((u) => u.id === p2);
          if (!found) throw notFound("User");
          const snapshots = getDb()
            .snapshots.filter((s) => s.userId === p2)
            .sort((a, b) => +new Date(b.capturedAt) - +new Date(a.capturedAt));
          return ok({ userId: p2, currentTarget: currentTargetFor(found.role), snapshots });
        }
        break;
      }

      // -------------------------- workspaces -------------------------------
      case "workspace": {
        const user = requireUser(req);
        const [domain, resource, sub, subId] = path.slice(1);

        if (domain === "email") {
          if (resource === "templates") {
            if (method === "GET") return ok(getDb().emailTemplates);
            if (method === "POST") {
              const b = await body(req);
              const name = str(b.name);
              if (!name) throw new ApiError(400, "VALIDATION", "Template name is required.");
              const template = {
                id: id("etm"),
                name,
                subject: str(b.subject),
                body: str(b.body),
                type: str(b.type) || "OUTREACH",
                createdAt: new Date().toISOString(),
                createdBy: user.id,
              };
              getDb().emailTemplates.unshift(template);
              saveDb();
              return ok(template, { status: 201 });
            }
          }
          if (resource === "drafts") {
            if (!sub && method === "GET") return ok(getDb().emailDrafts);
            if (!sub && method === "POST") {
              const b = await body(req);
              const subject = str(b.subject);
              if (!subject) throw new ApiError(400, "VALIDATION", "A subject is required.");
              const draft = {
                id: id("edr"),
                subject,
                body: str(b.body),
                status: "DRAFT" as const,
                campaignId: optionalStr(b.campaignId) ?? null,
                prospectIds: Array.isArray(b.prospectIds)
                  ? (b.prospectIds as unknown[]).map(str).filter(Boolean)
                  : [],
                sentAt: null,
                createdAt: new Date().toISOString(),
                createdBy: user.id,
              };
              getDb().emailDrafts.unshift(draft);
              saveDb();
              return ok(draft, { status: 201 });
            }
            if (sub && !subId && method === "GET") {
              const draft = getDb().emailDrafts.find((d) => d.id === sub);
              if (!draft) throw notFound("Draft");
              return ok(draft);
            }
            if (sub && subId === "send" && method === "POST") {
              // Human-initiated send only — GrowthOS never sends autonomously.
              const draft = getDb().emailDrafts.find((d) => d.id === sub);
              if (!draft) throw notFound("Draft");
              draft.status = "SENT";
              draft.sentAt = new Date().toISOString();
              saveDb();
              return ok({ sent: true, sentAt: draft.sentAt });
            }
          }
          if (resource === "stats" && method === "GET") {
            const db = getDb();
            return ok({
              templates: db.emailTemplates.length,
              drafts: db.emailDrafts.filter((d) => d.status === "DRAFT").length,
              sent: db.emailDrafts.filter((d) => d.status === "SENT").length,
            });
          }
        }

        if (domain === "seo") {
          if (resource === "audits") {
            if (method === "GET") {
              const campaignId = q.get("campaignId") ?? "";
              const items = getDb()
                .seoAudits.filter((a) => !campaignId || a.campaignId === campaignId)
                .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
              return ok(items);
            }
            if (method === "POST") {
              const b = await body(req);
              const campaignId = str(b.campaignId);
              if (!campaignId) throw new ApiError(400, "VALIDATION", "campaignId is required.");
              requireCampaign(campaignId);
              const db = getDb();
              const existing = db.seoAudits.filter((a) => a.campaignId === campaignId);
              const base = existing.length > 0 ? existing[0].overallScore : 70;
              const jitter = () => Math.round(Math.min(98, Math.max(45, base + (Math.random() * 14 - 6))));
              const audit = {
                id: id("aud"),
                campaignId,
                overallScore: jitter(),
                categories: {
                  performance: jitter(),
                  accessibility: jitter(),
                  seo: jitter(),
                  best_practices: jitter(),
                },
                recommendations: [
                  "Optimize Largest Contentful Paint to under 2.5s",
                  "Add descriptive alt text to images above the fold",
                  "Fix canonical URL mismatch on paginated pages",
                  "Add structured data for the FAQ section",
                ],
                errors: [
                  { message: "Missing meta description on 3 pages", severity: "error" },
                  { message: "Duplicate H1 on 1 page", severity: "warning" },
                ],
                createdAt: new Date().toISOString(),
              };
              db.seoAudits.unshift(audit);
              saveDb();
              return ok(audit, { status: 201 });
            }
          }
          if (resource === "keywords" && sub && method === "GET") {
            requireCampaign(sub);
            const campaign = getDb().campaigns.find((c) => c.id === sub)!;
            const niche = campaign.niche;
            return ok({
              campaignId: sub,
              niche,
              keywords: [
                { keyword: `${niche} tools`, volume: "1.2k", difficulty: "Medium", intent: "Commercial" },
                { keyword: `best ${niche}`, volume: "880", difficulty: "Low", intent: "Commercial" },
                { keyword: `${niche} comparison`, volume: "2.1k", difficulty: "High", intent: "Commercial" },
                { keyword: `what is ${niche}`, volume: "640", difficulty: "Low", intent: "Informational" },
                { keyword: `${niche} pricing`, volume: "920", difficulty: "Medium", intent: "Transactional" },
                { keyword: `${niche} alternatives`, volume: "1.5k", difficulty: "Medium", intent: "Commercial" },
              ],
            });
          }
          if (resource === "recommendations" && sub && method === "GET") {
            requireCampaign(sub);
            const audit = getDb().seoAudits.find((a) => a.campaignId === sub);
            return ok({
              campaignId: sub,
              recommendations: audit?.recommendations ?? [],
              errors: audit?.errors ?? [],
            });
          }
        }

        if (domain === "lead-magnets") {
          if (!resource && method === "GET") {
            const campaignId = q.get("campaignId") ?? "";
            const items = getDb()
              .leadMagnets.filter((l) => !campaignId || l.campaignId === campaignId)
              .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
            return ok(items);
          }
          if (!resource && method === "POST") {
            const b = await body(req);
            const name = str(b.name);
            if (!name) throw new ApiError(400, "VALIDATION", "A name is required.");
            const campaignId = optionalStr(b.campaignId);
            if (campaignId) requireCampaign(campaignId);
            const magnet = {
              id: id("lmg"),
              name,
              type: str(b.type) || "pdf",
              description: str(b.description),
              content: typeof b.content === "string" ? b.content : null,
              status: "DRAFT",
              campaignId: campaignId ?? null,
              downloadCount: 0,
              conversionRate: 0,
              createdAt: new Date().toISOString(),
            };
            getDb().leadMagnets.unshift(magnet);
            saveDb();
            return ok(magnet, { status: 201 });
          }
          if (resource && !sub && method === "GET") {
            const found = getDb().leadMagnets.find((l) => l.id === resource);
            if (!found) throw notFound("Lead magnet");
            return ok(found);
          }
          if (resource && !sub && method === "PATCH") {
            const found = getDb().leadMagnets.find((l) => l.id === resource);
            if (!found) throw notFound("Lead magnet");
            const b = await body(req);
            for (const key of ["name", "type", "description", "content", "status"] as const) {
              const value = b[key];
              if (typeof value === "string") (found as unknown as Json)[key] = value;
            }
            saveDb();
            return ok(found);
          }
          if (resource && sub === "performance" && method === "GET") {
            const found = getDb().leadMagnets.find((l) => l.id === resource);
            if (!found) throw notFound("Lead magnet");
            return ok({
              downloadCount: found.downloadCount,
              conversionRate: found.conversionRate,
              history: [
                { period: "THIS_WEEK", downloads: Math.round(found.downloadCount * 0.2) },
                { period: "THIS_MONTH", downloads: Math.round(found.downloadCount * 0.6) },
                { period: "THIS_MONTH_PREV", downloads: Math.round(found.downloadCount * 0.4) },
              ],
            });
          }
        }

        break;
      }

      // ----------------------------- me ------------------------------------
      case "me": {
        const user = requireUser(req);
        return Response.json({ user: publicUser(user) });
      }

      default:
        break;
    }

    throw new ApiError(404, "NOT_FOUND", `No API route for ${method} /api/${path.join("/")}`);
  } catch (error) {
    return fail(error);
  }
}

// Keep hashPassword import referenced for future credential seeding endpoints.
void hashPassword;
