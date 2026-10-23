import { appUrl } from './env.js';

process.env.DATABASE_URL = appUrl();
process.env.DATABASE_SSL = 'off';
process.env.DATABASE_POOL_MAX = '5';
process.env.SUPABASE_URL = 'https://testproject.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-test-key';
process.env.FRONTEND_URL = 'https://growthos.example.test';
process.env.SUPABASE_JWT_AUDIENCE = 'authenticated';
process.env.SUPABASE_JWT_SECRET = 'test-jwt-secret-that-is-long-enough-for-hs256';
process.env.CRON_SECRET = 'c'.repeat(40);
