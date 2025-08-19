/**
 * Supabase admin client configuration
 * 
 * This client uses the service role key and bypasses RLS
 * Only use for admin operations where RLS bypass is needed
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required Supabase admin environment variables')
}

/**
 * Admin client with service role key - bypasses RLS
 * USE WITH CAUTION - Only for server-side operations
 */
export const supabaseAdmin = createClient<Database>(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  }
)