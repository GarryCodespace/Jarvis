// Common types for Jarvix authentication system

export interface SerializedSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: {
    id: string;
    email: string;
    user_metadata?: {
      avatar_url?: string;
      full_name?: string;
      [key: string]: any;
    };
  };
  expires_at?: number;
}

export interface UserLite {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
}

export interface Profile {
  id: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Device {
  id: string;
  user_id: string;
  platform: string;
  app_version: string;
  last_seen_at: string;
  created_at: string;
}

export interface SessionAudit {
  id: string;
  user_id: string;
  event: 'LOGIN' | 'LOGOUT' | 'TOKEN_REFRESH' | 'FAILED';
  user_agent?: string;
  ip?: string;
  created_at: string;
}

export type AuthStatus = 'idle' | 'checking' | 'unauthed' | 'authed' | 'error';

// IPC contract types
export interface ElectronAuth {
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  getCachedSession(): Promise<SerializedSession | null>;
  ensureDeviceRegistered(): Promise<void>;
  audit(event: 'LOGIN' | 'LOGOUT' | 'TOKEN_REFRESH' | 'FAILED'): Promise<void>;
  
  // Event handlers (assigned by renderer)
  loginSuccess?: ((session: SerializedSession) => void) | null;
  loginFailed?: ((message: string) => void) | null;
  loggedOut?: (() => void) | null;
  
  // Event listener methods
  onLoginSuccess?(callback: (session: SerializedSession) => void): void;
  onLoginFailed?(callback: (message: string) => void): void;
  onLoggedOut?(callback: () => void): void;
  removeAllAuthListeners?(): void;
}

export interface ElectronAPI {
  auth: ElectronAuth;
}

// Utility function
export function mapSupabaseUserToUserLite(user: any): UserLite {
  return {
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name,
    avatar_url: user.user_metadata?.avatar_url,
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}