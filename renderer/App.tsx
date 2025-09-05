import React from 'react';
import { AuthGate } from './components/Auth/AuthGate';
import { ToastProvider } from './components/Toasts';

// Main app content (authenticated state)
const MainAppContent: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* This is where the existing Jarvix overlay content would go */}
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Jarvix Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Welcome to your AI assistant. You are now authenticated and ready to use all features.
          </p>
          
          {/* Placeholder for main app functionality */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                AI Chat
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Interactive AI conversations and assistance
              </p>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Screen Capture
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Intelligent screen analysis and insights
              </p>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Voice Commands
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Hands-free AI interaction and control
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthGate>
        <MainAppContent />
      </AuthGate>
    </ToastProvider>
  );
};