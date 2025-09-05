import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { SerializedSession } from '../common/types';

// Environment variables with fallbacks for development
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

// Create Supabase client (renderer-only, anon key)
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // We handle session persistence via Electron main process
    detectSessionInUrl: false, // No URL-based auth detection in desktop app
    autoRefreshToken: true, // Let Supabase handle token refresh
  },
});

/**
 * Hydrates the Supabase client with a session from the main process
 * This triggers onAuthStateChange subscriptions
 */
export async function hydrateSession(session: SerializedSession): Promise<void> {
  try {
    // Convert SerializedSession to Supabase Session format
    const supabaseSession: Session = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user as any, // Type assertion for compatibility
      expires_at: session.expires_at,
    };

    // Set the session in Supabase client
    const { error } = await supabase.auth.setSession(supabaseSession);
    
    if (error) {
      throw new Error(`Failed to hydrate session: ${error.message}`);
    }

    console.log('✅ Session hydrated successfully');
  } catch (error) {
    console.error('❌ Failed to hydrate session:', error);
    throw error;
  }
}

/**
 * Gets the current user from Supabase
 */
export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      throw new Error(`Failed to get user: ${error.message}`);
    }

    return user;
  } catch (error) {
    console.error('❌ Failed to get current user:', error);
    throw error;
  }
}

/**
 * Signs out the user (clears session from Supabase client)
 */
export async function signOutFromSupabase(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      throw new Error(`Failed to sign out from Supabase: ${error.message}`);
    }

    console.log('✅ Signed out from Supabase client');
  } catch (error) {
    console.error('❌ Failed to sign out from Supabase:', error);
    throw error;
  }
}

// Export the client as default
export default supabase;