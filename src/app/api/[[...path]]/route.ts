import type { NextRequest } from "next/server";
import { dispatch } from "@/server/handlers";

type Ctx = { params: Promise<{ path?: string[] }> };

async function run(req: NextRequest, ctx: Ctx, method: string) {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ code: "NOT_FOUND", message: "This development API is disabled." }, { status: 404 });
  }
  const { path } = await ctx.params;
  return dispatch(req, method, path ?? []);
}

export function GET(req: NextRequest, ctx: Ctx) {
  return run(req, ctx, "GET");
}

export function POST(req: NextRequest, ctx: Ctx) {
  return run(req, ctx, "POST");
}

export function PUT(req: NextRequest, ctx: Ctx) {
  return run(req, ctx, "PUT");
}

export function PATCH(req: NextRequest, ctx: Ctx) {
  return run(req, ctx, "PATCH");
}

export function DELETE(req: NextRequest, ctx: Ctx) {
  return run(req, ctx, "DELETE");
}
