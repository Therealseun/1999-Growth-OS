import { z } from 'zod';
import { assertActive, loadProfile } from '../../../lib/auth.js';
import { ApiError, forbidden, unauthorized } from '../../../lib/errors.js';
import { route } from '../../../lib/http.js';
import { authClient } from '../../../lib/supabase.js';

const body = z.object({ refresh_token: z.string().min(1).max(2048) });

// Access tokens are short lived. The frontend calls this before or after one expires.
// The account is checked again, so a user disabled after logging in cannot keep renewing.
export const POST = route({ auth: 'none', body }, async ({ body: input }) => {
  const { data, error } = await authClient().auth.refreshSession({ refresh_token: input.refresh_token });

  if (error || !data?.session) {
    if (error?.status === 429) throw new ApiError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.');
    throw unauthorized('Session expired. Log in again.', 'INVALID_REFRESH_TOKEN');
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
