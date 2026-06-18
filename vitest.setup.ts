import '@testing-library/jest-dom/vitest';

// Stub environment variables that Supabase clients may read at import time.
// Individual tests should `vi.mock('@/lib/supabase/server')` (and /client) to
// avoid hitting the real client; these stubs just keep module evaluation safe.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';
