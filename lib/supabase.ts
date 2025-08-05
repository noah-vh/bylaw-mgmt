/**
 * Supabase client configuration
 * 
 * This file sets up the Supabase client with proper TypeScript support
 * and environment variable configuration.
 */

import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

// Environment variable validation
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(`
    Missing required Supabase environment variables:
    - NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? '✓' : '✗'}
    - NEXT_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✓' : '✗'}
  `);
}

/**
 * Type-safe Supabase client for public operations
 */
export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Client for browser/server-side operations with anonymous access
 */
export const supabase: TypedSupabaseClient = createSupabaseClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: {
        'X-Client-Info': 'municipal-portal@1.0.0',
      },
    },
  }
);


/**
 * Create a Supabase client for use in client components
 * This client automatically handles authentication state and session management
 */
export function createClient() {
  return supabase;
}

// Default export for compatibility
export default supabase;