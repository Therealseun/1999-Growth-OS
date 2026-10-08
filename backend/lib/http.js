import { randomUUID } from 'node:crypto';
import { authenticate } from './auth.js';
import { ApiError, errorResponse, invalid, tooLarge } from './errors.js';
import { requireRole } from './guard.js';
import { authenticateCron, authenticateIntegration } from './service-auth.js';

// Every route is wrapped in route(). It handles who is calling, validation, errors and the response format,
// so a handler only contains business logic.
//
//   export const PATCH = route(
//     { roles: ['ADMIN'], body: z.object({ name: z.string() }) },
//     async ({ session, params, body }) => {
//       return json({ ok: true });
//     },
//   );
//
// options.auth  'user' (default, Supabase JWT) | 'integration' (X-Integration-Key) | 'cron' (CRON_SECRET) | 'none'
// options.roles roles allowed when auth is 'user'
// options.scope scope the integration key needs
// options.body  zod schema for the JSON body
// options.query zod schema for the query string
// options.maxBytes largest accepted body (default 1 MB)
//
// The handler receives { request, session, client, params, body, query, requestId }.
// session = { userId, profile } for users, client = the integration client for integrations.
// Return a plain object for a 200, or use json(), created(), accepted(), noContent().

// Not "instanceof Response": the Node server swaps in its own Response class, so instanceof fails
// for responses made earlier. Checking the shape works with every Response implementation.
const isResponse = (value) =>
  value != null && typeof value === 'object' && typeof value.status === 'number' && typeof value.headers?.set === 'function';

export const json = (data, status = 200) => Response.json(data, { status });
export const created = (data) => json(data, 201);
export const accepted = (data) => json(data, 202);
export const noContent = () => new Response(null, { status: 204 });

const DEFAULT_MAX_BYTES = 1_048_576;

function zodDetails(error) {
  return {
    fields: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  };
}

async function readBody(request, schema, maxBytes) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge(maxBytes);

  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes) throw tooLarge(maxBytes);

  let data;
  if (text.trim() !== '') {
    try {
      data = JSON.parse(text);
    } catch {
      throw invalid('Request body is not valid JSON', undefined, 'INVALID_JSON');
    }
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw invalid('Validation failed', zodDetails(parsed.error));
  return parsed.data;
}

function readQuery(request, schema) {
  const raw = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw invalid('Validation failed', zodDetails(parsed.error));
  return parsed.data;
}

export function route(options, handler) {
  const opts = { auth: 'user', maxBytes: DEFAULT_MAX_BYTES, ...options };
  if (opts.roles && opts.auth !== 'user') {
    throw new Error('route(): roles can only be used with auth "user"');
  }
  if (opts.scope && opts.auth !== 'integration') {
    throw new Error('route(): scope can only be used with auth "integration"');
  }

  return async function handle(request, context) {
    const requestId = randomUUID();
    try {
      let session;
      let client;
      if (opts.auth === 'user') {
        session = await authenticate(request);
        if (opts.roles) requireRole(session.profile, opts.roles);
      } else if (opts.auth === 'integration') {
        client = await authenticateIntegration(request, opts.scope);
      } else if (opts.auth === 'cron') {
        authenticateCron(request);
      }

      // params may be a plain object or a promise. await handles both.
      const params = (await context?.params) ?? {};
      const body = opts.body ? await readBody(request, opts.body, opts.maxBytes) : undefined;
      const query = opts.query ? readQuery(request, opts.query) : undefined;

      const result = await handler({ request, session, client, params, body, query, requestId });
      const response = isResponse(result) ? result : json(result ?? {});
      response.headers.set('x-request-id', requestId);
      return response;
    } catch (err) {
      if (!(err instanceof ApiError) && err?.name === 'AbortError') throw err;
      return errorResponse(err, requestId);
    }
  };
}
