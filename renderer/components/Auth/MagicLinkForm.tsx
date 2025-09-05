import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuthToasts } from '../Toasts';
import { Spinner } from '../Spinner';

interface MagicLinkFormProps {
  className?: string;
}

export const MagicLinkForm: React.FC<MagicLinkFormProps> = ({ className = '' }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { showMagicLinkSent, showLoginError } = useAuthToasts();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      showLoginError('Please enter your email address');
      return;
    }

    setLoading(true);
    
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: 'jarvix://auth/callback', // Deep link for desktop app
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      setSent(true);
      showMagicLinkSent(email);
      
    } catch (error) {
      console.error('❌ Magic link failed:', error);
      showLoginError(error instanceof Error ? error.message : 'Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  const handleTryAgain = () => {
    setSent(false);
    setEmail('');
  };

  if (sent) {
    return (
      <div className={`text-center space-y-4 ${className}`}>
        <div className="w-16 h-16 mx-auto mb-4 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
          <span className="text-2xl">📧</span>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Check your inbox
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          We sent a magic link to <strong>{email}</strong>
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-500">
          Click the link in your email to sign in to Jarvix
        </p>
        <button
          type="button"
          onClick={handleTryAgain}
          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 focus:outline-none focus:underline transition-colors"
        >
          Try a different email
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="magic-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email address
          </label>
          <input
            id="magic-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
            placeholder="Enter your email"
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="group relative w-full flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <Spinner size="sm" className="text-gray-600 dark:text-gray-300" />
          ) : (
            <>
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
            </>
          )}
        </button>
      </form>
      
      <p className="text-xs text-center text-gray-500 dark:text-gray-500">
        We'll send you a secure link to sign in instantly
      </p>
    </div>
  );
};