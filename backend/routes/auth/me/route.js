import { route } from '../../../lib/http.js';

// PENDING and DISABLED accounts never get here: authenticate() answers 403 ACCOUNT_PENDING / ACCOUNT_DISABLED.
export const GET = route({}, async ({ session }) => session.profile);
