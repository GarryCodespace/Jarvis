import React, { useState } from 'react';
import { EmailPasswordForm } from './EmailPasswordForm';
import { MagicLinkForm } from './MagicLinkForm';
import { useAuthToasts } from '../Toasts';
import { Spinner } from '../Spinner';

type LoginMethod = 'google' | 'email' | 'magic';

export const LoginMethods: React.FC = () => {
  const [activeMethod, setActiveMethod] = useState<LoginMethod | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { showLoginError } = useAuthToasts();

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    
    try {
      await window.electron.auth.signInWithGoogle();
      // Success will be handled by IPC event listeners
    } catch (error) {
      console.error('❌ Google sign-in failed:', error);
      showLoginError(error instanceof Error ? error.message : 'Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleMethodSelect = (method: LoginMethod) => {
    if (method === 'google') {
      handleGoogleSignIn();
    } else {
      setActiveMethod(activeMethod === method ? null : method);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
      {/* Google Sign-In Button */}
      <button
        onClick={() => handleMethodSelect('google')}
        disabled={googleLoading}
        className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {googleLoading ? (
          <Spinner size="sm" className="text-gray-600 dark:text-gray-300" />
        ) : (
          <>
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </>
        )}
      </button>

      {/* Separator */}
      <div className="my-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300 dark:border-gray-600" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              Or continue with
            </span>
          </div>
        </div>
      </div>

      {/* Email/Password and Magic Link Toggle Buttons */}
      <div className="space-y-2">
        <button
          onClick={() => handleMethodSelect('email')}
          className={`w-full flex items-center justify-center px-4 py-3 border rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
            activeMethod === 'email'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
          }`}
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          Log in with email & password
        </button>

        <button
          onClick={() => handleMethodSelect('magic')}
          className={`w-full flex items-center justify-center px-4 py-3 border rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
            activeMethod === 'magic'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
          }`}
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Send magic link
        </button>
      </div>

      {/* Render active method form */}
      {activeMethod === 'email' && (
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <EmailPasswordForm />
        </div>
      )}

      {activeMethod === 'magic' && (
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <MagicLinkForm />
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 text-center">
        <p className="text-xs text-gray-500 dark:text-gray-500">
          By signing in, you agree to our{' '}
          <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
};