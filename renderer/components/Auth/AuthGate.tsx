import React, { useEffect, ReactNode } from 'react';
import { useAuthStore, useAuthStatus, useIsInitialized, setupAuthEventListeners } from '../../state/authStore';
import { LoadingScreen } from '../Spinner';
import { WelcomeCard } from './WelcomeCard';
import { LoginMethods } from './LoginMethods';
import { ProfileMenu } from './ProfileMenu';
import { useToast } from '../Toasts';

interface AuthGateProps {
  children: ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const status = useAuthStatus();
  const isInitialized = useIsInitialized();
  const initialize = useAuthStore((state) => state.initialize);
  const error = useAuthStore((state) => state.error);
  const setError = useAuthStore((state) => state.setError);
  const { showToast } = useToast();

  useEffect(() => {
    // Setup IPC event listeners on mount
    setupAuthEventListeners();
    
    // Initialize auth state
    initialize();
  }, [initialize]);

  const handleRetry = () => {
    setError(undefined);
    initialize();
  };

  // Show loading screen while initializing
  if (!isInitialized || status === 'checking') {
    return <LoadingScreen />;
  }

  // Show error state with retry option
  if (status === 'error') {
    return (
      <div className="fixed inset-0 bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-6">
          <div className="mb-4 text-6xl">❌</div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Authentication Error
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {error || 'Something went wrong with authentication.'}
          </p>
          <button
            onClick={handleRetry}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Show authentication UI for unauthenticated users
  if (status === 'unauthed') {
    return (
      <div className="fixed inset-0 bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <WelcomeCard />
          <LoginMethods />
        </div>
      </div>
    );
  }

  // Show authenticated app with profile menu
  if (status === 'authed') {
    return (
      <div className="relative">
        {/* Profile menu in top-right */}
        <div className="fixed top-4 right-4 z-50">
          <ProfileMenu />
        </div>
        
        {/* Main app content */}
        {children}
      </div>
    );
  }

  // Fallback loading state
  return <LoadingScreen />;
};