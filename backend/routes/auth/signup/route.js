import { z } from 'zod';
import { ApiError, invalid } from '../../../lib/errors.js';
import { created, route } from '../../../lib/http.js';
import { getConfig } from '../../../lib/config.js';
import { authClient } from '../../../lib/supabase.js';

const body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(72),
});

// Creates the account. A database trigger makes the profile with role EMPLOYEE and status PENDING,
// and ignores any role or status sent by the client. An Admin must approve the account before it works.
//
// The answer is identical whether or not the email already existed, so this endpoint cannot be used
// to find out who has an account.
export const POST = route({ auth: 'none', body }, async ({ body: input, requestId }) => {
  const { error } = await authClient().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { name: input.name },
      emailRedirectTo: new URL('/auth/login', getConfig().FRONTEND_URL).toString(),
    },
  });

  if (error && error.code !== 'user_already_exists') {
    if (error.code === 'weak_password') throw invalid(error.message, undefined, 'WEAK_PASSWORD');
    if (error.status === 429) throw new ApiError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.');
    console.warn(JSON.stringify({
      level: 'warn',
      requestId,
      event: 'supabase_signup_failed',
      status: error.status,
      code: error.code,
      message: error.message,
    }));
    throw new ApiError(502, 'AUTH_PROVIDER_ERROR', 'The sign-up service could not complete the request');
  }

  return created({
    name: input.name,
    email: input.email,
    role: 'EMPLOYEE',
    status: 'PENDING',
    department_id: null,
    message: 'Account created. An Admin must approve it before you can log in.',
  });
});
