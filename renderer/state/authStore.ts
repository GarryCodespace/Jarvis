import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { AuthStatus, UserLite, SerializedSession, mapSupabaseUserToUserLite } from '../common/types';
import { hydrateSession, getCurrentUser, supabase } from '../lib/supabaseClient';

interface AuthState {
  status: AuthStatus;
  user: UserLite | null;
  error?: string;
  isInitialized: boolean;
}

interface AuthActions {
  setStatus: (status: AuthStatus) => void;
  setUser: (user: UserLite | null) => void;
  setError: (error?: string) => void;
  initialize: () => Promise<void>;
  handleLoginSuccess: (session: SerializedSession) => Promise<void>;
  handleLoginFailed: (message: string) => void;
  handleLoggedOut: () => void;
  signOut: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      status: 'idle',
      user: null,
      error: undefined,
      isInitialized: false,

      // Actions
      setStatus: (status) => {
        set({ status }, false, 'setStatus');
      },

      setUser: (user) => {
        set({ user }, false, 'setUser');
      },

      setError: (error) => {
        set({ error }, false, 'setError');
      },

      // Initialize auth state on app startup
      initialize: async () => {
        const { setStatus, setUser, setError, handleLoginSuccess } = get();
        
        try {
          setStatus('checking');
          setError(undefined);

          // Check for cached session from main process
          const cachedSession = await window.electron.auth.getCachedSession();
          
          if (cachedSession) {
            console.log('🔄 Found cached session, hydrating...');
            await handleLoginSuccess(cachedSession);
          } else {
            console.log('❌ No cached session found');
            setStatus('unauthed');
          }
        } catch (error) {
          console.error('❌ Auth initialization failed:', error);
          setError(error instanceof Error ? error.message : 'Authentication initialization failed');
          setStatus('error');
        } finally {
          set({ isInitialized: true }, false, 'initialize_complete');
        }
      },

      // Handle successful login from IPC events
      handleLoginSuccess: async (session: SerializedSession) => {
        const { setStatus, setUser, setError } = get();
        
        try {
          console.log('🔄 Handling login success...');
          
          // Hydrate Supabase session
          await hydrateSession(session);
          
          // Get user data from Supabase
          const user = await getCurrentUser();
          
          if (!user) {
            throw new Error('Session hydrated but user data unavailable');
          }

          // Convert to UserLite and store
          const userLite = mapSupabaseUserToUserLite(user);
          setUser(userLite);
          setStatus('authed');
          setError(undefined);

          // Ensure device is registered
          await window.electron.auth.ensureDeviceRegistered();
          
          // Audit the login
          await window.electron.auth.audit('LOGIN');
          
          console.log('✅ Login completed successfully');
          
        } catch (error) {
          console.error('❌ Login success handler failed:', error);
          setError(error instanceof Error ? error.message : 'Login processing failed');
          setStatus('error');
        }
      },

      // Handle login failure from IPC events
      handleLoginFailed: (message: string) => {
        const { setStatus, setError } = get();
        
        console.error('❌ Login failed:', message);
        setError(message);
        setStatus('unauthed');
        
        // Audit the failed login
        window.electron.auth.audit('FAILED').catch(console.error);
      },

      // Handle logout from IPC events
      handleLoggedOut: () => {
        const { setStatus, setUser, setError } = get();
        
        console.log('🔄 Handling logout...');
        setUser(null);
        setStatus('unauthed');
        setError(undefined);
        
        // Audit the logout
        window.electron.auth.audit('LOGOUT').catch(console.error);
      },

      // Sign out action
      signOut: async () => {
        try {
          // Call main process to handle logout
          await window.electron.auth.signOut();
          // handleLoggedOut will be called via IPC event
        } catch (error) {
          console.error('❌ Sign out failed:', error);
          get().setError(error instanceof Error ? error.message : 'Sign out failed');
        }
      },
    }),
    {
      name: 'jarvix-auth-store',
    }
  )
);

// Setup IPC event listeners (call this once when app starts)
export function setupAuthEventListeners() {
  const store = useAuthStore.getState();
  
  // Listen for auth events from main process
  if (window.electron?.auth) {
    // Setup event listeners using the proper API
    if (window.electron.auth.onLoginSuccess) {
      window.electron.auth.onLoginSuccess((session: SerializedSession) => {
        store.handleLoginSuccess(session);
      });
    }

    if (window.electron.auth.onLoginFailed) {
      window.electron.auth.onLoginFailed((message: string) => {
        store.handleLoginFailed(message);
      });
    }

    if (window.electron.auth.onLoggedOut) {
      window.electron.auth.onLoggedOut(() => {
        store.handleLoggedOut();
      });
    }

    console.log('✅ Auth event listeners setup complete');
  } else {
    console.warn('⚠️ window.electron.auth not available - running in development mode?');
  }
}

// Auth store selectors for easier component consumption
export const useAuthStatus = () => useAuthStore((state) => state.status);
export const useAuthUser = () => useAuthStore((state) => state.user);
export const useAuthError = () => useAuthStore((state) => state.error);
export const useIsAuthenticated = () => useAuthStore((state) => state.status === 'authed');
export const useIsInitialized = () => useAuthStore((state) => state.isInitialized);