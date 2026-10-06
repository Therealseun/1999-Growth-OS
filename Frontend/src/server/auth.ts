// Server-side authentication and authorization.
// Tokens are HMAC-signed stateless JWT-like strings; the backend is authoritative
// for every authorization decision (the frontend only hides UI).
import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb, hashPassword, saveDb, type ServerUser } from "./store";
import type { UserRole } from "@/lib/types";

const SECRET = process.env.GROWTHOS_TOKEN_SECRET ?? "growthos-dev-secret-change-in-production";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export type TokenPayload = {
  sub: string;
  role: UserRole;
  exp: number;
};

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function issueToken(user: ServerUser): { token: string; expiresIn: number } {
  const payload: TokenPayload = {
    sub: user.id,
    role: user.role,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  const token = `${body}.${sign(body)}`;
  return { token, expiresIn: Math.round(TOKEN_TTL_MS / 1000) };
}

export function verifyToken(token: string | null | undefined): TokenPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    if (typeof payload.sub !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (!header) return null;
  return header.startsWith("Bearer ") ? header.slice(7) : header;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function currentUser(req: Request): ServerUser | null {
  const payload = verifyToken(bearerToken(req));
  if (!payload) return null;
  const db = getDb();
  const user = db.users.find((u) => u.id === payload.sub && u.active);
  return user ?? null;
}

/** Require an authenticated user; throws ApiError(401) otherwise. */
export function requireUser(req: Request): ServerUser {
  const user = currentUser(req);
  if (!user) throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  return user;
}

/** Require one of the given roles; throws ApiError(403) otherwise. */
export function requireRole(req: Request, roles: UserRole[]): ServerUser {
  const user = requireUser(req);
  if (!roles.includes(user.role)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action.");
  }
  return user;
}

/**
 * Employees may only touch their own records; managers/admins see the team.
 * Returns true when `userId` is the requesting user, otherwise enforces roles.
 */
export function canAccessUser(user: ServerUser, userId: string): boolean {
  if (user.id === userId) return true;
  return user.role === "ADMIN" || user.role === "MANAGER";
}

export function login(email: string, password: string): { user: ServerUser; token: string; expiresIn: number } {
  const db = getDb();
  const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user || !user.active || user.passwordHash !== hashPassword(password)) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }
  const { token, expiresIn } = issueToken(user);
  return { user, token, expiresIn };
}

export function createUser(input: {
  email: string;
  name: string;
  role: UserRole;
  password?: string;
}): ServerUser {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  if (db.users.some((u) => u.email.toLowerCase() === email)) {
    throw new ApiError(409, "EMAIL_TAKEN", "An account with that email already exists.");
  }
  const user: ServerUser = {
    id: `u-${Date.now().toString(36)}`,
    email,
    name: input.name.trim(),
    role: input.role,
    avatarUrl: null,
    passwordHash: hashPassword(input.password ?? "password"),
    active: true,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  saveDb();
  return user;
}
