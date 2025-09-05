import React from 'react';

export const WelcomeCard: React.FC = () => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-8">
      {/* Header with Jarvix logo/icon */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
          <span className="text-2xl font-bold text-white">J</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Welcome to Jarvix
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Your AI assistant for productivity
        </p>
      </div>

      {/* Feature highlights */}
      <div className="space-y-4 mb-8">
        <FeatureItem
          icon="💬"
          title="Smart meeting insights"
          description="Transcription and real-time analysis"
        />
        <FeatureItem
          icon="⚡"
          title="AI-powered automation"
          description="Streamline your workflow"
        />
        <FeatureItem
          icon="📊"
          title="Real-time analytics"
          description="Track your productivity insights"
        />
      </div>
    </div>
  );
};

interface FeatureItemProps {
  icon: string;
  title: string;
  description: string;
}

const FeatureItem: React.FC<FeatureItemProps> = ({ icon, title, description }) => {
  return (
    <div className="flex items-start space-x-3">
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
        <span className="text-lg" role="img">
          {icon}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
          {title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {description}
        </p>
      </div>
    </div>
  );
};