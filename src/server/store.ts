// Server-side data store for GrowthOS.
// Data is seeded on first run and persisted to .data/db.json so admin-configured
// workload targets and historical snapshots survive restarts.
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type {
  AuthUser,
  Campaign,
  Evidence,
  Prospect,
  Task,
  UserRole,
  WorkloadSnapshot,
  WorkloadTarget,
} from "@/lib/types";

export type ServerUser = AuthUser & {
  passwordHash: string;
  active: boolean;
  createdAt: string;
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

export type SeoAudit = {
  id: string;
  campaignId: string;
  overallScore: number;
  categories: Record<string, number>;
  recommendations: string[];
  errors: { message: string; severity: string }[];
  createdAt: string;
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

export type ReportRecord = {
  id: string;
  type: string;
  campaignId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  format: string;
  status: string;
  downloadUrl: string | null;
  createdAt: string;
  createdBy: string;
};

export type NicheIntelligence = {
  niche: string;
  insights: string[];
  opportunities: string[];
  risks: string[];
  competitors: string[];
};

export type Database = {
  users: ServerUser[];
  campaigns: Campaign[];
  prospects: Prospect[];
  tasks: Task[];
  evidence: Evidence[];
  targets: WorkloadTarget[];
  snapshots: WorkloadSnapshot[];
  emailTemplates: EmailTemplate[];
  emailDrafts: EmailDraft[];
  seoAudits: SeoAudit[];
  leadMagnets: LeadMagnet[];
  reports: ReportRecord[];
  intelligence: Record<string, NicheIntelligence>;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");

export function id(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

const DAY = 24 * 60 * 60 * 1000;

function iso(daysBack: number, hourOffset = 0): string {
  return new Date(Date.now() - daysBack * DAY + hourOffset * 60 * 60 * 1000).toISOString();
}

// Deterministic hash so seed data is stable across fresh installs.
// Real logins verify with the same function (see server/auth.ts).
export function hashPassword(password: string): string {
  return createHash("sha256").update(`growthos:${password}`).digest("hex");
}

function pick<T>(arr: T[], index: number): T {
  return arr[index % arr.length];
}

export function seed(): Database {
  const users: ServerUser[] = (
    [
      { id: "u-admin", email: "admin@growthos.io", name: "Daniel Admin", role: "ADMIN", avatarUrl: null },
      { id: "u-manager", email: "manager@growthos.io", name: "Sarah Manager", role: "MANAGER", avatarUrl: null },
      { id: "u-emp-1", email: "employee@growthos.io", name: "Alex Employee", role: "EMPLOYEE", avatarUrl: null },
      { id: "u-emp-2", email: "mia@growthos.io", name: "Mia Chen", role: "EMPLOYEE", avatarUrl: null },
      { id: "u-emp-3", email: "tom@growthos.io", name: "Tom Rivera", role: "EMPLOYEE", avatarUrl: null },
      { id: "u-emp-4", email: "grace@growthos.io", name: "Grace Okafor", role: "EMPLOYEE", avatarUrl: null },
    ] as const
  ).map((u) => ({
    ...u,
    role: u.role as UserRole,
    passwordHash: hashPassword("password"),
    active: true,
    createdAt: iso(90),
  }));

  const campaignSeeds = [
    {
      name: "SaaS HR Outreach",
      niche: "HR software for mid-market teams",
      targetAudience: "HR directors at 50–500 employee companies",
      objective: "Generate 50 qualified leads within 30 days",
      status: "ACTIVE" as const,
    },
    {
      name: "FinTech SMB Growth",
      niche: "Accounting automation for small businesses",
      targetAudience: "Finance leads at 10–200 employee firms",
      objective: "Book 20 product demos this quarter",
      status: "ACTIVE" as const,
    },
    {
      name: "HealthTech Expansion",
      niche: "Patient engagement platforms for clinics",
      targetAudience: "Practice managers at multi-site clinics",
      objective: "Build a 300-contact warm list",
      status: "ACTIVE" as const,
    },
    {
      name: "Real Estate Nurture",
      niche: "Lead follow-up tooling for agencies",
      targetAudience: "Brokerage owners in tier-2 cities",
      objective: "Re-engage 150 dormant leads",
      status: "PAUSED" as const,
    },
    {
      name: "E-commerce Retention",
      niche: "Lifecycle email tooling for DTC brands",
      targetAudience: "Growth leads at $1M–$20M DTC brands",
      objective: "Pilot with 12 brands",
      status: "COMPLETED" as const,
    },
  ];

  const campaigns: Campaign[] = campaignSeeds.map((c, i) => ({
    id: `cmp-${i + 1}`,
    ...c,
    createdAt: iso(60 - i * 7),
    updatedAt: iso(3 - i),
    ownerId: i % 2 === 0 ? "u-admin" : "u-manager",
  }));

  const firstNames = ["Ada", "Ben", "Chloe", "David", "Elena", "Frank", "Grace", "Hugo", "Ivy", "Jonas", "Keira", "Liam", "Maya", "Noah", "Olga", "Pierre", "Quinn", "Rita", "Sam", "Tara", "Umar", "Vera", "Will", "Xena", "Yusuf", "Zoe", "Amir", "Bella", "Caleb", "Dina", "Eli", "Farah", "Gabe", "Hana", "Ivan", "Julia"];
  const companies = ["Northwind Labs", "Acme Cloud", "Blue Harbor", "Cirrus HR", "Delta Books", "Ember Finance", "Fernwood", "Glow Retail", "Hexa Health", "Ion Systems", "Juniper Group", "Kestrel AI"];
  const statuses: Prospect["status"][] = ["SEED", "SEED", "CONTACTED", "CONTACTED", "QUALIFIED", "CONVERTED"];
  const sources = ["Sift research", "LinkedIn", "Referral", "Conference", "Inbound"];

  const prospects: Prospect[] = firstNames.map((firstName, i) => ({
    id: `prs-${i + 1}`,
    firstName,
    lastName: pick(["Okafor", "Silva", "Novak", "Haddad", "Kim", "Rossi", "Weber", "Costa"], i),
    email: `${firstName.toLowerCase()}@${pick(companies, i).toLowerCase().replace(/\s+/g, "")}.com`,
    company: pick(companies, i),
    role: pick(["Head of People", "CFO", "COO", "Growth Lead", "Founder", "Ops Manager"], i),
    source: pick(sources, i),
    campaignId: pick(campaigns, i).id,
    status: pick(statuses, i),
    notes: null,
    createdAt: iso(45 - (i % 30)),
  }));

  const taskTemplates: { type: Task["type"]; title: string; description: string }[] = [
    { type: "EMAIL", title: "Send intro email sequence", description: "Personalised 3-step outreach to qualified prospects." },
    { type: "EMAIL", title: "Follow up with non-responders", description: "Day-5 follow-up for prospects with no reply." },
    { type: "SEO", title: "Audit landing page SEO", description: "Review meta tags, headings and page speed." },
    { type: "SEO", title: "Keyword gap analysis", description: "Compare target keywords against top 3 competitors." },
    { type: "LEAD_MAGNET", title: "Draft ROI calculator lead magnet", description: "Interactive calculator capturing work email." },
    { type: "LEAD_MAGNET", title: "Design checklist PDF", description: "10-point compliance checklist for the niche." },
    { type: "EMAIL", title: "Re-engage dormant leads", description: "Breakup email to prospects with no engagement in 21 days." },
    { type: "SEO", title: "Fix broken internal links", description: "Crawl the blog and repair 404 internal links." },
  ];
  const taskStatuses: Task["status"][] = ["COMPLETED", "COMPLETED", "COMPLETED", "IN_PROGRESS", "IN_PROGRESS", "PENDING", "PENDING", "BLOCKED"];
  const employees = users.filter((u) => u.role === "EMPLOYEE");

  const tasks: Task[] = [];
  const evidence: Evidence[] = [];
  for (let i = 0; i < 36; i++) {
    const tpl = pick(taskTemplates, i);
    const assignee = i % 5 === 0 ? "u-emp-1" : pick(employees, i).id;
    const status = i < 12 ? pick(taskStatuses, i) : pick(taskStatuses, i + 3);
    const createdAt = iso(30 - (i % 28));
    const completedAt = status === "COMPLETED" ? iso(20 - (i % 18)) : null;
    const taskId = `tsk-${i + 1}`;
    tasks.push({
      id: taskId,
      type: tpl.type,
      title: tpl.title,
      description: tpl.description,
      status,
      assignedTo: assignee,
      assignedBy: i % 3 === 0 ? "u-admin" : "u-manager",
      campaignId: pick(campaigns, i).id,
      dueDate: iso(-(i % 10) + 4),
      completedAt,
      createdAt,
      priority: pick(["LOW", "MEDIUM", "HIGH"], i) as Task["priority"],
    });
    if (status === "COMPLETED" && i % 2 === 0) {
      evidence.push({
        id: id("evd"),
        taskId,
        type: i % 4 === 0 ? "LINK" : "SCREENSHOT",
        title: i % 4 === 0 ? "Campaign report link" : "Completion screenshot",
        url: i % 4 === 0 ? "https://example.com/reports/" + taskId : null,
        metadata: null,
        submittedAt: completedAt ?? iso(10),
        submittedBy: assignee,
      });
    }
  }

  // Admin-configured targets. These are configuration data, never hardcoded in UI.
  const targets: WorkloadTarget[] = [
    { id: "wlt-admin", role: "ADMIN", dailyTaskTarget: 4, weeklyTaskTarget: 20, activeCampaignsTarget: 5, updatedAt: iso(40), updatedBy: "u-admin" },
    { id: "wlt-manager", role: "MANAGER", dailyTaskTarget: 6, weeklyTaskTarget: 30, activeCampaignsTarget: 6, updatedAt: iso(40), updatedBy: "u-admin" },
    { id: "wlt-employee", role: "EMPLOYEE", dailyTaskTarget: 8, weeklyTaskTarget: 40, activeCampaignsTarget: 2, updatedAt: iso(12), updatedBy: "u-admin" },
  ];

  // Historical snapshots: each carries the target values that were active when it
  // was captured. Older snapshots intentionally differ from current targets.
  const snapshots: WorkloadSnapshot[] = [];
  let snapN = 0;
  for (const emp of employees) {
    for (const daysBack of [1, 3, 7, 14, 21, 28]) {
      const period: WorkloadSnapshot["period"] = daysBack <= 1 ? "TODAY" : daysBack <= 7 ? "THIS_WEEK" : "THIS_MONTH";
      const wasRetro = daysBack >= 14; // targets were lower before the admin changed them
      snapshots.push({
        id: id("snp"),
        userId: emp.id,
        period,
        tasksCompleted: Math.max(1, 9 - daysBack + (snapN % 4)),
        tasksAssigned: 10 + (snapN % 5),
        targetSnapshot: {
          dailyTaskTarget: wasRetro ? 5 : 8,
          weeklyTaskTarget: wasRetro ? 25 : 40,
          activeCampaignsTarget: wasRetro ? 1 : 2,
        },
        capturedAt: iso(daysBack),
      });
      snapN++;
    }
  }

  const emailTemplates: EmailTemplate[] = [
    { id: id("etm"), name: "Cold intro", subject: "Quick idea for {{company}}", body: "Hi {{firstName}},\n\nI noticed {{company}} is scaling — here's how teams like yours cut prep time in half.", type: "OUTREACH", createdAt: iso(30), createdBy: "u-manager" },
    { id: id("etm"), name: "Day-5 follow-up", subject: "Re: Quick idea for {{company}}", body: "Hi {{firstName}},\n\nBumping this in case it got buried. Happy to share a 2-minute walkthrough.", type: "FOLLOW_UP", createdAt: iso(25), createdBy: "u-manager" },
    { id: id("etm"), name: "Breakup email", subject: "Closing the loop", body: "Hi {{firstName}},\n\nI'll assume the timing isn't right and close the file. Reply any time.", type: "BREAKUP", createdAt: iso(20), createdBy: "u-admin" },
    { id: id("etm"), name: "Demo invite", subject: "15 minutes this week?", body: "Hi {{firstName}},\n\nWould a short demo help? Here's a link that shows the workflow end to end.", type: "OUTREACH", createdAt: iso(12), createdBy: "u-manager" },
  ];

  const emailDrafts: EmailDraft[] = [
    { id: id("edr"), subject: "Quick idea for Northwind Labs", body: "Hi Ada,\n\nTeams like Northwind are cutting prep time in half…", status: "DRAFT", campaignId: "cmp-1", prospectIds: ["prs-1"], sentAt: null, createdAt: iso(2), createdBy: "u-emp-1" },
    { id: id("edr"), subject: "Re: accounting automation", body: "Bumping this in case it got buried.", status: "DRAFT", campaignId: "cmp-2", prospectIds: ["prs-2", "prs-3"], sentAt: null, createdAt: iso(1), createdBy: "u-emp-2" },
    { id: id("edr"), subject: "15 minutes this week?", body: "Would a short demo help?", status: "SENT", campaignId: "cmp-1", prospectIds: ["prs-4"], sentAt: iso(3), createdAt: iso(4), createdBy: "u-emp-1" },
    { id: id("edr"), subject: "Closing the loop", body: "I'll assume the timing isn't right.", status: "SENT", campaignId: "cmp-3", prospectIds: ["prs-5"], sentAt: iso(6), createdAt: iso(7), createdBy: "u-emp-3" },
    { id: id("edr"), subject: "Pilot invite for DTC brands", body: "We have two pilot slots left this month.", status: "SENT", campaignId: "cmp-5", prospectIds: ["prs-6"], sentAt: iso(9), createdAt: iso(10), createdBy: "u-emp-4" },
  ];

  const seoAudits: SeoAudit[] = campaigns.slice(0, 3).map((c, i) => ({
    id: id("aud"),
    campaignId: c.id,
    overallScore: [82, 68, 74][i],
    categories: { performance: [88, 72, 79][i], accessibility: [95, 85, 91][i], seo: [74, 61, 66][i], best_practices: [86, 79, 83][i] },
    recommendations: [
      "Optimize Largest Contentful Paint to under 2.5s",
      "Add descriptive alt text to hero images",
      "Fix canonical URL mismatch on blog posts",
      "Add structured data for the FAQ section",
    ],
    errors: [
      { message: "Missing meta description on 4 pages", severity: "error" },
      { message: "Duplicate H1 on 2 pages", severity: "warning" },
    ],
    createdAt: iso(5 - i),
  }));

  const leadMagnets: LeadMagnet[] = [
    { id: id("lm-"), name: "HR Compliance Checklist", type: "pdf", description: "10-point checklist for people teams onboarding new hires.", status: "PUBLISHED", campaignId: "cmp-1", downloadCount: 312, conversionRate: 12.4, createdAt: iso(28), },
    { id: id("lm-"), name: "ROI Calculator", type: "tool", description: "Interactive calculator showing payback period for HR tooling.", status: "PUBLISHED", campaignId: "cmp-1", downloadCount: 187, conversionRate: 18.9, createdAt: iso(21) },
    { id: id("lm-"), name: "Accounting Automation Guide", type: "pdf", description: "Field guide to automating reconciliation for small firms.", status: "PUBLISHED", campaignId: "cmp-2", downloadCount: 143, conversionRate: 9.7, createdAt: iso(16) },
    { id: id("lm-"), name: "Clinic Onboarding Template", type: "template", description: "Copy-paste onboarding workflow for multi-site clinics.", status: "DRAFT", campaignId: "cmp-3", downloadCount: 0, conversionRate: 0, createdAt: iso(6) },
    { id: id("lm-"), name: "Lifecycle Email Swipe File", type: "template", description: "12 lifecycle emails that lifted retention 14% in pilots.", status: "PUBLISHED", campaignId: "cmp-5", downloadCount: 264, conversionRate: 15.2, createdAt: iso(35) },
  ];

  const reports: ReportRecord[] = [
    { id: id("rpt"), type: "PIPELINE", format: "PDF", status: "READY", downloadUrl: "/api/reports/placeholder", createdAt: iso(8), createdBy: "u-admin" },
    { id: id("rpt"), type: "PERFORMANCE", format: "CSV", status: "READY", downloadUrl: "/api/reports/placeholder", createdAt: iso(5), createdBy: "u-manager" },
    { id: id("rpt"), type: "TASK_AUDIT", format: "PDF", status: "READY", downloadUrl: "/api/reports/placeholder", createdAt: iso(2), createdBy: "u-admin" },
  ];

  const intelligence: Record<string, NicheIntelligence> = {
    "cmp-1": {
      niche: "HR software for mid-market teams",
      insights: [
        "Mid-market buyers shortlist vendors in under 9 days — speed of first response is the top predictor of meetings.",
        "Compliance and onboarding content drives 3× more organic signups than generic thought leadership.",
        "62% of target accounts run quarterly tooling reviews in Jan and Jul — align outreach to those windows.",
      ],
      opportunities: [
        "Partner with HR communities for co-branded ROI content.",
        "Anchor pricing against per-employee/month benchmarks competitors avoid publishing.",
      ],
      risks: [
        "Incumbent ATS vendors bundle HR features at no marginal cost.",
        "Budget freezes hit mid-market HR in Q3 more than other functions.",
      ],
      competitors: ["Workday Mid-Market", "BambooHR", "HiBob"],
    },
    "cmp-2": {
      niche: "Accounting automation for small businesses",
      insights: [
        "Owners search for 'reconcile fast' rather than product categories — capture problem-led keywords.",
        "Trust signals (bank integrations, SOC 2) convert 2× better than feature lists.",
      ],
      opportunities: [
        "Accountant referral channel: practices influence 70% of software picks.",
        "Quarter-end timing: outreach 2 weeks before close beats any other window.",
      ],
      risks: ["Bank-native automation reduces willingness to pay for standalone tools."],
      competitors: ["Xero", "QuickBooks", "Ramp"],
    },
    "cmp-3": {
      niche: "Patient engagement platforms for clinics",
      insights: [
        "Clinic managers decide in groups — include operations leads in every sequence.",
        "No-show reduction is the single most persuasive outcome metric.",
      ],
      opportunities: ["Case studies from two-site clinics open enterprise conversations."],
      risks: ["HIPAA procurement reviews add 4–6 weeks to cycles."],
      competitors: ["Athenahealth", "PatientPop"],
    },
  };

  return {
    users,
    campaigns,
    prospects,
    tasks,
    evidence,
    targets,
    snapshots,
    emailTemplates,
    emailDrafts,
    seoAudits,
    leadMagnets,
    reports,
    intelligence,
  };
}

function load(): Database {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf8");
      const parsed = JSON.parse(raw) as Database;
      if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Corrupt or unreadable store — fall through to a fresh seed.
  }
  const fresh = seed();
  persist(fresh);
  return fresh;
}

function persist(db: Database): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db), "utf8");
  } catch {
    // Persistence is best-effort; the in-memory store remains authoritative.
  }
}

const globalStore = globalThis as unknown as { __growthosDb?: Database };

export function getDb(): Database {
  if (!globalStore.__growthosDb) {
    globalStore.__growthosDb = load();
  }
  return globalStore.__growthosDb;
}

export function saveDb(): void {
  if (globalStore.__growthosDb) persist(globalStore.__growthosDb);
}
