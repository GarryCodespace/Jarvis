const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Screenshot and OCR
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  
  // Speech recognition
  startSpeechRecognition: () => ipcRenderer.invoke('start-speech-recognition'),
  stopSpeechRecognition: () => ipcRenderer.invoke('stop-speech-recognition'),
  getSpeechAvailability: () => ipcRenderer.invoke('get-speech-availability'),
  
  // Window management
  showAllWindows: () => ipcRenderer.invoke('show-all-windows'),
  hideAllWindows: () => ipcRenderer.invoke('hide-all-windows'),
  enableWindowInteraction: () => ipcRenderer.invoke('enable-window-interaction'),
  disableWindowInteraction: () => ipcRenderer.invoke('disable-window-interaction'),
  switchToChat: () => ipcRenderer.invoke('switch-to-chat'),
  switchToSkills: () => ipcRenderer.invoke('switch-to-skills'),
  resizeWindow: (width, height) => ipcRenderer.invoke('resize-window', { width, height }),
  moveWindow: (deltaX, deltaY) => ipcRenderer.invoke('move-window', { deltaX, deltaY }),
  getWindowStats: () => ipcRenderer.invoke('get-window-stats'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  
  // Session memory
  getSessionHistory: () => ipcRenderer.invoke('get-session-history'),
  getLLMSessionHistory: () => ipcRenderer.invoke('get-llm-session-history'),
  clearSessionMemory: () => ipcRenderer.invoke('clear-session-memory'),
  formatSessionHistory: () => ipcRenderer.invoke('format-session-history'),
  sendChatMessage: (text) => ipcRenderer.invoke('send-chat-message', text),
  sendChatMessageWithFiles: (text, files) => ipcRenderer.invoke('send-chat-message-with-files', text, files),
  getSkillPrompt: (skillName) => ipcRenderer.invoke('get-skill-prompt', skillName),
  
  // OpenAI LLM configuration
  setOpenAIApiKey: (apiKey) => ipcRenderer.invoke('set-openai-api-key', apiKey),
  getOpenAIStatus: () => ipcRenderer.invoke('get-openai-status'),
  testOpenAIConnection: () => ipcRenderer.invoke('test-openai-connection'),
  
  // Payment and subscription
  initiatePremiumUpgrade: (plan) => ipcRenderer.invoke('initiate-premium-upgrade', plan),
  checkPremiumStatus: () => ipcRenderer.invoke('check-premium-status'),
  cancelSubscription: () => ipcRenderer.invoke('cancel-subscription'),
  getSubscriptionManagement: () => ipcRenderer.invoke('get-subscription-management'),
  
  // Authentication (legacy - for backward compatibility)
  authSignUp: (email, password) => ipcRenderer.invoke('auth-sign-up', email, password),
  authSignIn: (email, password) => ipcRenderer.invoke('auth-sign-in', email, password),
  authSignOut: () => ipcRenderer.invoke('auth-sign-out'),
  authGetUser: () => ipcRenderer.invoke('auth-get-user'),
  // authGoogleSignIn: () => ipcRenderer.invoke('auth-google-sign-in'), // Temporarily disabled
  
  // Settings
  showSettings: () => ipcRenderer.invoke('show-settings'),
  hideSettings: () => ipcRenderer.invoke('hide-settings'),

  // Auth window
  showAuth: () => ipcRenderer.invoke('show-auth'),
  hideAuth: () => ipcRenderer.invoke('hide-auth'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  updateAppIcon: (iconKey) => ipcRenderer.invoke('update-app-icon', iconKey),
  updateActiveSkill: (skill) => ipcRenderer.invoke('update-active-skill', skill),
  restartAppForStealth: () => ipcRenderer.invoke('restart-app-for-stealth'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  quit: () => {
    try {
      // Primary quit method
      ipcRenderer.send('quit-app');
      
      // Fallback quit methods with increasing delay
      setTimeout(() => {
        ipcRenderer.invoke('quit-app').catch(() => {
          // Final fallback - force close
          window.close();
        });
      }, 100);
      
    } catch (error) {
      console.error('Error in quit:', error);
      // Emergency quit
      try {
        window.close();
      } catch (e) {
        console.error('Emergency quit failed:', e);
      }
    }
  },
  
  // LLM window specific methods
  expandLlmWindow: (contentMetrics) => ipcRenderer.invoke('expand-llm-window', contentMetrics),
  resizeLlmWindowForContent: (contentMetrics) => ipcRenderer.invoke('resize-llm-window-for-content', contentMetrics),

  // Clipboard helper for reliable copy actions
  copyToClipboard: (text) => {
    try {
      return ipcRenderer.invoke('copy-to-clipboard', String(text ?? ''));
    } catch (e) {
      console.error('copyToClipboard failed:', e);
      return false;
    }
  },
  
  // Display management
  listDisplays: () => ipcRenderer.invoke('list-displays'),
  captureArea: (options) => ipcRenderer.invoke('capture-area', options),
  
  // Event listeners
  onTranscriptionReceived: (callback) => ipcRenderer.on('transcription-received', callback),
  onInterimTranscription: (callback) => ipcRenderer.on('interim-transcription', callback),
  onSpeechStatus: (callback) => ipcRenderer.on('speech-status', callback),
  onSpeechError: (callback) => ipcRenderer.on('speech-error', callback),
  onSpeechAvailability: (callback) => ipcRenderer.on('speech-availability', callback),
  onSessionEvent: (callback) => ipcRenderer.on('session-event', callback),
  onSessionCleared: (callback) => ipcRenderer.on('session-cleared', callback),
  onOcrCompleted: (callback) => ipcRenderer.on('ocr-completed', callback),
  onOcrError: (callback) => ipcRenderer.on('ocr-error', callback),
  onLlmResponse: (callback) => ipcRenderer.on('llm-response', callback),
  onLlmError: (callback) => ipcRenderer.on('llm-error', callback),
  onTranscriptionLlmResponse: (callback) => ipcRenderer.on('transcription-llm-response', callback),
  onOpenGeminiConfig: (callback) => ipcRenderer.on('open-gemini-config', callback),
  onDisplayLlmResponse: (callback) => ipcRenderer.on('display-llm-response', callback),
  onShowLoading: (callback) => ipcRenderer.on('show-loading', callback),
  onSkillChanged: (callback) => ipcRenderer.on('skill-changed', callback),
  onInteractionModeChanged: (callback) => ipcRenderer.on('interaction-mode-changed', callback),
  onRecordingStarted: (callback) => ipcRenderer.on('recording-started', callback),
  onRecordingStopped: (callback) => ipcRenderer.on('recording-stopped', callback),
  onCodingLanguageChanged: (callback) => ipcRenderer.on('coding-language-changed', callback),
  
  // Generic receive method
  receive: (channel, callback) => ipcRenderer.on(channel, callback),
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
})

// New auth API contract for React renderer
contextBridge.exposeInMainWorld('electron', {
  auth: {
    // Methods (async/invoke)
    signInWithGoogle: () => ipcRenderer.invoke('auth-google-signin'),
    signOut: () => ipcRenderer.invoke('auth-signout'),
    getCachedSession: () => ipcRenderer.invoke('auth-get-cached-session'),
    ensureDeviceRegistered: () => ipcRenderer.invoke('auth-ensure-device-registered'),
    audit: (event) => ipcRenderer.invoke('auth-audit', event),

    // Event handlers (will be assigned by renderer)
    loginSuccess: null,
    loginFailed: null,
    loggedOut: null,

    // Event listener setup (called by renderer)
    onLoginSuccess: (callback) => {
      ipcRenderer.on('auth-login-success', (event, session) => {
        if (typeof callback === 'function') callback(session);
      });
    },

    onLoginFailed: (callback) => {
      ipcRenderer.on('auth-login-failed', (event, message) => {
        if (typeof callback === 'function') callback(message);
      });
    },

    onLoggedOut: (callback) => {
      ipcRenderer.on('auth-logged-out', () => {
        if (typeof callback === 'function') callback();
      });
    },

    // Remove event listeners
    removeAllAuthListeners: () => {
      ipcRenderer.removeAllListeners('auth-login-success');
      ipcRenderer.removeAllListeners('auth-login-failed');
      ipcRenderer.removeAllListeners('auth-logged-out');
    },
  }
})

contextBridge.exposeInMainWorld('api', {
    send: (channel, data) => {
        let validChannels = [
            'close-settings',
            'quit-app',
            'save-settings',
            'toggle-recording',
            'toggle-interaction-mode',
            'update-skill',
            'window-loaded'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        } else {
            console.warn('Invalid IPC channel:', channel);
        }
    },
    receive: (channel, func) => {
        let validChannels = [
            'load-settings',
            'recording-state-changed',
            'interaction-mode-changed',
            'skill-updated',
            'update-skill',
            'recording-started',
            'recording-stopped'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    }
});