import { z } from 'zod';
import { assertActive, loadProfile } from '../../../lib/auth.js';
import { ApiError, forbidden, unauthorized } from '../../../lib/errors.js';
import { route } from '../../../lib/http.js';
import { authClient } from '../../../lib/supabase.js';

const body = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(72),
});

// Pending and disabled accounts get 403 and no token. Wrong credentials always gives 401.
export const POST = route({ auth: 'none', body }, async ({ body: input }) => {
  const { data, error } = await authClient().auth.signInWithPassword(input);

  if (error) {
    if (error.status === 429) throw new ApiError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.');
    if (error.code === 'email_not_confirmed') throw forbidden('Confirm your email first', 'EMAIL_NOT_CONFIRMED');
    if (error.status && error.status >= 500) {
      throw new ApiError(502, 'AUTH_PROVIDER_ERROR', 'The login service could not complete the request');
    }
    throw unauthorized('Wrong email or password', 'INVALID_CREDENTIALS');
  }

  const profile = await loadProfile(data.user.id);
  if (!profile) throw forbidden('No profile exists for this account', 'NO_PROFILE');
  assertActive(profile);

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    profile,
  };
});
