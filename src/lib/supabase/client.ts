// src/lib/supabase/client.ts  — Browser singleton
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database.types'

// Module-level singleton — one client instance per browser tab
let _client: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createClient() {
  if (!_client) {
    _client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return _client
}

export { createClient as createBrowserClient }
