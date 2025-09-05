import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (toast: Omit<Toast, 'id'>) => {
    const id = Date.now().toString();
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration || 5000,
    };

    setToasts((prev) => [...prev, newToast]);

    // Auto-remove toast after duration
    setTimeout(() => {
      removeToast(id);
    }, newToast.duration);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
};

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onRemove(toast.id), 150); // Wait for exit animation
  };

  const typeStyles = {
    success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
    warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200',
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
  };

  const iconMap = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };

  return (
    <div
      className={`transform transition-all duration-150 ease-out ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div
        className={`
          max-w-sm rounded-lg border p-4 shadow-lg backdrop-blur-sm
          ${typeStyles[toast.type]}
        `}
        role="alert"
      >
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <span className="text-lg" role="img" aria-label={toast.type}>
              {iconMap[toast.type]}
            </span>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium">{toast.title}</h3>
            {toast.message && (
              <div className="mt-1 text-sm opacity-90">{toast.message}</div>
            )}
          </div>
          <div className="ml-4 flex-shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex rounded-md p-1.5 hover:bg-black/5 dark:hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-current"
              aria-label="Dismiss"
            >
              <span className="text-lg">×</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper hooks for common toast patterns
export const useAuthToasts = () => {
  const { showToast } = useToast();

  return {
    showLoginSuccess: () => showToast({
      type: 'success',
      title: 'Welcome back!',
      message: 'You have been successfully authenticated.',
    }),
    
    showLoginError: (message: string) => showToast({
      type: 'error',
      title: 'Authentication failed',
      message,
    }),
    
    showSignupSuccess: () => showToast({
      type: 'success',
      title: 'Account created!',
      message: 'Welcome to Jarvix. You are now signed in.',
    }),
    
    showMagicLinkSent: (email: string) => showToast({
      type: 'info',
      title: 'Check your inbox',
      message: `We sent a magic link to ${email}`,
    }),
    
    showLogoutSuccess: () => showToast({
      type: 'info',
      title: 'Signed out',
      message: 'You have been successfully signed out.',
    }),
  };
};