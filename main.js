require("dotenv").config();

const { app, BrowserWindow, globalShortcut, session, ipcMain } = require("electron");
const logger = require("./src/core/logger").createServiceLogger("MAIN");
const config = require("./src/core/config");

// Services
// Screen capture (image-based)
const captureService = require("./src/services/capture.service");
const speechService = require("./src/services/speech.service");
const llmService = require("./src/services/openai.service");
const paymentService = require("./src/services/payment.service");
const supabaseService = require("./src/services/supabase.service");
const documentService = require("./src/services/pdf.service");

// Managers
const windowManager = require("./src/managers/window.manager");
const sessionManager = require("./src/managers/session.manager");

class ApplicationController {
  constructor() {
    this.isReady = false;
    this.activeSkill = "general";
  // Default programming language
  this.codingLanguage = "javascript";
    this.speechAvailable = false;

    // Window configurations for reference
    this.windowConfigs = {
      main: { title: "JARVIX" },
      chat: { title: "Chat" },
      llmResponse: { title: "AI Response" },
      settings: { title: "Settings" },
    };

    this.setupStealth();
    this.setupEventHandlers();
  }

  setupStealth() {
    if (config.get("stealth.disguiseProcess")) {
      process.title = config.get("app.processTitle");
    }

    // Set default stealth app name early
    app.setName("JARVIX "); // Default to JARVIX mode
    process.title = "JARVIX ";

    if (
      process.platform === "darwin" &&
      config.get("stealth.noAttachConsole")
    ) {
      process.env.ELECTRON_NO_ATTACH_CONSOLE = "1";
      process.env.ELECTRON_NO_ASAR = "1";
    }
  }

  setupEventHandlers() {
    app.whenReady().then(() => this.onAppReady());
    app.on("window-all-closed", () => this.onWindowAllClosed());
    app.on("activate", () => this.onActivate());
    app.on("will-quit", () => this.onWillQuit());
    app.on("before-quit", () => this.onBeforeQuit());

    this.setupIPCHandlers();
    this.setupServiceEventHandlers();
  }

  async onAppReady() {
    // Force stealth mode IMMEDIATELY when app is ready
    app.setName("JARVIX ");
    process.title = "JARVIX ";

    logger.info("Application starting", {
      version: config.get("app.version"),
      environment: config.get("app.isDevelopment")
        ? "development"
        : "production",
      platform: process.platform,
    });

    try {
      this.setupPermissions();

      // Small delay to ensure desktop/space detection is accurate
      await new Promise((resolve) => setTimeout(resolve, 200));

      await windowManager.initializeWindows();
      this.setupGlobalShortcuts();

      // Initialize default stealth mode with jarvis icon
      this.updateAppIcon("jarvis");

      this.isReady = true;

      logger.info("Application initialized successfully", {
        windowCount: Object.keys(windowManager.getWindowStats().windows).length,
        currentDesktop: "detected",
      });

      sessionManager.addEvent("Application started");
    } catch (error) {
      logger.error("Application initialization failed", {
        error: error.message,
      });
      app.quit();
    }
  }

  setupPermissions() {
    session.defaultSession.setPermissionRequestHandler(
      (webContents, permission, callback) => {
        const allowedPermissions = ["microphone", "camera", "display-capture"];
        const granted = allowedPermissions.includes(permission);

        logger.debug("Permission request", { permission, granted });
        callback(granted);
      }
    );
  }

  setupGlobalShortcuts() {
    const shortcuts = {
      "CommandOrControl+Shift+S": () => this.triggerScreenshotOCR(),
      "CommandOrControl+Shift+K": () => windowManager.toggleVisibility(),
      "CommandOrControl+Shift+I": () => windowManager.toggleInteraction(),
      "CommandOrControl+Shift+C": () => windowManager.switchToWindow("chatgpt"),
      "CommandOrControl+Shift+\\": () => this.clearSessionMemory(),
      "CommandOrControl+,": () => windowManager.showSettings(),
      "Alt+A": () => windowManager.toggleInteraction(),
      "Alt+R": () => this.toggleSpeechRecognition(),
      "CommandOrControl+Shift+T": () => windowManager.forceAlwaysOnTopForAllWindows(),
      "CommandOrControl+Shift+Alt+T": () => {
        const results = windowManager.testAlwaysOnTopForAllWindows();
        logger.info('Always-on-top test triggered via shortcut', results);
      },
      // Context-sensitive shortcuts based on interaction mode
      "CommandOrControl+Up": () => this.handleUpArrow(),
      "CommandOrControl+Down": () => this.handleDownArrow(),
      "CommandOrControl+Left": () => this.handleLeftArrow(),
      "CommandOrControl+Right": () => this.handleRightArrow(),
    };

    Object.entries(shortcuts).forEach(([accelerator, handler]) => {
      const success = globalShortcut.register(accelerator, handler);
      logger.debug("Global shortcut registered", { accelerator, success });
    });
  }

  setupServiceEventHandlers() {
    speechService.on("recording-started", () => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("recording-started");
      });
    });

    speechService.on("recording-stopped", () => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("recording-stopped");
      });
    });

    speechService.on("transcription", (text) => {      
      // Add transcription to session memory
      sessionManager.addUserInput(text, 'speech');
      
      const windows = BrowserWindow.getAllWindows();
      
      windows.forEach((window) => {
        window.webContents.send("transcription-received", { text });
      });
      
      // Automatically process transcription with LLM for intelligent response
      setTimeout(async () => {
        try {
          const sessionHistory = sessionManager.getOptimizedHistory();
          await this.processTranscriptionWithLLM(text, sessionHistory);
        } catch (error) {
          logger.error("Failed to process transcription with LLM", {
            error: error.message,
            text: text.substring(0, 100)
          });
        }
      }, 500);
    });

    speechService.on("interim-transcription", (text) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("interim-transcription", { text });
      });
    });

    speechService.on("status", (status) => {
      this.speechAvailable = speechService.isAvailable ? speechService.isAvailable() : false;
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("speech-status", { status, available: this.speechAvailable });
      });
      // Also broadcast availability specifically
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("speech-availability", { available: this.speechAvailable });
      });
    });

    speechService.on("error", (error) => {
      // In error, still compute availability
      this.speechAvailable = speechService.isAvailable ? speechService.isAvailable() : false;
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("speech-error", { error, available: this.speechAvailable });
      });
    });
  }

  setupIPCHandlers() {
  ipcMain.handle("take-screenshot", () => this.triggerScreenshotOCR());
  ipcMain.handle("list-displays", () => captureService.listDisplays());
  ipcMain.handle("capture-area", (event, options) => captureService.captureAndProcess(options));
    
    // Provide reliable clipboard write via main process
    ipcMain.handle("copy-to-clipboard", (event, text) => {
      try {
        const { clipboard } = require("electron");
        // Clear any existing clipboard content and formats
        clipboard.clear();
        // Write only plain text to ensure no formatting is preserved
        clipboard.writeText(String(text ?? ""));
        return true;
      } catch (e) {
        logger.error("Failed to write to clipboard", { error: e.message });
        return false;
      }
    });
    
    ipcMain.handle("get-speech-availability", () => {
      return speechService.isAvailable ? speechService.isAvailable() : false;
    });

    ipcMain.handle("start-speech-recognition", () => {
      speechService.startRecording();
      return speechService.getStatus();
    });

    ipcMain.handle("stop-speech-recognition", () => {
      speechService.stopRecording();
      return speechService.getStatus();
    });

    // Also handle direct send events for fallback
    ipcMain.on("start-speech-recognition", () => {
      speechService.startRecording();
    });

    ipcMain.on("stop-speech-recognition", () => {
      speechService.stopRecording();
    });

    ipcMain.on("chat-window-ready", () => {
      // Send a test message to confirm communication
      setTimeout(() => {
        windowManager.broadcastToAllWindows("transcription-received", {
          text: "Test message from main process - chat window communication is working!",
        });
      }, 1000);
    });

    ipcMain.on("test-chat-window", () => {
      windowManager.broadcastToAllWindows("transcription-received", {
        text: "🧪 IMMEDIATE TEST: Chat window IPC communication test successful!",
      });
    });

    ipcMain.handle("show-all-windows", () => {
      windowManager.showAllWindows();
      return windowManager.getWindowStats();
    });

    ipcMain.handle("hide-all-windows", () => {
      windowManager.hideAllWindows();
      return windowManager.getWindowStats();
    });

    ipcMain.handle("enable-window-interaction", () => {
      windowManager.setInteractive(true);
      return windowManager.getWindowStats();
    });

    ipcMain.handle("disable-window-interaction", () => {
      windowManager.setInteractive(false);
      return windowManager.getWindowStats();
    });

    ipcMain.handle("switch-to-chat", () => {
      windowManager.switchToWindow("chat");
      return windowManager.getWindowStats();
    });

    ipcMain.handle("switch-to-skills", () => {
      windowManager.switchToWindow("skills");
      return windowManager.getWindowStats();
    });

    ipcMain.handle("resize-window", (event, { width, height }) => {
      const mainWindow = windowManager.getWindow("main");
      if (mainWindow) {
        // Enforce horizontal constraints: min ~one icon, max original width
        const minW = 60;
        const maxW = windowManager.windowConfigs?.main?.width || 520;
        const clampedWidth = Math.max(minW, Math.min(maxW, Math.round(width || minW)));
        try {
          // Match content size to the DOM so no extra transparent area remains
          mainWindow.setContentSize(Math.max(1, clampedWidth), Math.max(1, Math.round(height)));
        } catch (e) {
          // Fallback in case setContentSize isn’t available on some platform
          mainWindow.setSize(Math.max(1, clampedWidth), Math.max(1, Math.round(height)));
        }
        logger.debug("Main window resized (content)", { width: clampedWidth, height });
      }
      return { success: true };
    });

    ipcMain.handle("move-window", (event, { deltaX, deltaY }) => {
      const mainWindow = windowManager.getWindow("main");
      if (mainWindow) {
        const [currentX, currentY] = mainWindow.getPosition();
        const newX = currentX + deltaX;
        const newY = currentY + deltaY;
        mainWindow.setPosition(newX, newY);
        logger.debug("Main window moved", {
          deltaX,
          deltaY,
          from: { x: currentX, y: currentY },
          to: { x: newX, y: newY },
        });
      }
      return { success: true };
    });

    ipcMain.handle("get-session-history", () => {
      return sessionManager.getOptimizedHistory();
    });

    ipcMain.handle("clear-session-memory", () => {
      sessionManager.clear();
      windowManager.broadcastToAllWindows("session-cleared");
      return { success: true };
    });

    ipcMain.handle("force-always-on-top", () => {
      windowManager.forceAlwaysOnTopForAllWindows();
      return { success: true };
    });

    ipcMain.handle("test-always-on-top", () => {
      const results = windowManager.testAlwaysOnTopForAllWindows();
      return { success: true, results };
    });

    ipcMain.handle("send-chat-message", async (event, text) => {
      // Add chat message to session memory
      sessionManager.addUserInput(text, 'chat');
      logger.debug('Chat message added to session memory', { textLength: text.length });
      
      // Process chat message with LLM and send to ChatGPT window specifically
      setTimeout(async () => {
        try {
          const sessionHistory = sessionManager.getOptimizedHistory();
          // Use a simple general chat approach
          let llmResult;
          try {
            // Try to use the LLM service directly without skills
            logger.debug('Checking LLM service availability', { 
              hasClient: !!llmService.client, 
              hasModel: !!llmService.model,
              isInitialized: llmService.isInitialized 
            });
            
            if (llmService.isInitialized) {
              logger.debug('Sending message to OpenAI', { messagePreview: text.substring(0, 50) });
              try {
                const response = await llmService.generateContentDirect(`You are J.A.R.V.I.X, Tony Stark's AI assistant. You are intelligent, helpful, sophisticated, and have a slight British accent in your responses. Please respond helpfully to this message: ${text}`);
                logger.debug('OpenAI response received', { responsePreview: response.substring(0, 100) });
                
                llmResult = {
                  response: response,
                  metadata: { processingTime: Date.now(), usedFallback: false }
                };
              } catch (primaryError) {
                logger.warn('OpenAI request failed', { error: primaryError.message });
                throw primaryError;
              }
            } else {
              logger.warn('OpenAI service not properly initialized', {
                isInitialized: llmService.isInitialized
              });
              throw new Error('OpenAI service not initialized');
            }
          } catch (error) {
            logger.error('LLM generation failed, using fallback', { error: error.message });
            // Fallback response if LLM fails
            llmResult = {
              response: 'I\'m here and ready to help! Please ask me anything you\'d like assistance with.',
              metadata: { processingTime: 0, usedFallback: true }
            };
          }

          // Send response specifically to ChatGPT window only
          const chatGPTWindow = windowManager.getWindow('chatgpt');
          if (chatGPTWindow && !chatGPTWindow.isDestroyed()) {
            chatGPTWindow.webContents.send('llm-response', {
              response: llmResult.response,
              metadata: llmResult.metadata
            });
          }

          sessionManager.addModelResponse(llmResult.response, {
            skill: 'general',
            processingTime: llmResult.metadata.processingTime,
            usedFallback: llmResult.metadata.usedFallback,
            isChatResponse: true
          });

        } catch (error) {
          logger.error("Failed to process chat message with LLM", {
            error: error.message,
            text: text.substring(0, 100)
          });
          
          // Send fallback response
          const chatGPTWindow = windowManager.getWindow('chatgpt');
          if (chatGPTWindow && !chatGPTWindow.isDestroyed()) {
            chatGPTWindow.webContents.send('llm-response', {
              response: 'I\'m here and ready to help! Please ask me anything you\'d like assistance with.',
              metadata: { processingTime: 0, usedFallback: true }
            });
          }
        }
      }, 500);
      
      return { success: true };
    });

    ipcMain.handle("send-chat-message-with-files", async (event, text, files) => {
      // Add chat message to session memory
      const messageText = text || 'Analyzing uploaded files...';
      sessionManager.addUserInput(messageText, 'chat');
      logger.debug('Chat message with files added to session memory', { textLength: messageText.length, fileCount: files ? files.length : 0 });
      
      // Process files if provided
      if (files && files.length > 0) {
        setTimeout(async () => {
          try {
            // Process each file
            for (const file of files) {
              if (file.type && (file.type.startsWith('image/') || file.type === 'application/pdf' || file.type.includes('document') || file.type.includes('word') || file.name.endsWith('.docx') || file.name.endsWith('.doc'))) {
                // Check premium access for image processing
                const premiumAccess = await paymentService.validatePremiumAccess('image_processing');
                
                if (!premiumAccess.allowed) {
                  // Send premium upgrade prompt to user
                  const chatGPTWindow = windowManager.getWindow('chatgpt');
                  if (chatGPTWindow && !chatGPTWindow.isDestroyed()) {
                    const upgradeMessage = this.buildPremiumUpgradeMessage(file.name, premiumAccess.upgradePrompt);
                    chatGPTWindow.webContents.send('llm-response', {
                      response: upgradeMessage,
                      metadata: { 
                        processingTime: 0, 
                        usedFallback: true,
                        requiresPremium: true,
                        upgradePrompt: premiumAccess.upgradePrompt
                      }
                    });
                  }
                  continue; // Skip processing this file
                }
                
                // Handle different file types appropriately
                try {
                  const sessionHistory = sessionManager.getOptimizedHistory();
                  const skillsRequiringProgrammingLanguage = ['dsa'];
                  const needsProgrammingLanguage = skillsRequiringProgrammingLanguage.includes(this.activeSkill);
                  
                  // Convert file to buffer for processing
                  let buffer;
                  if (file.data && Array.isArray(file.data)) {
                    // Handle serialized file data from frontend
                    buffer = Buffer.from(file.data);
                  } else if (file.arrayBuffer) {
                    // Handle original File object
                    const arrayBuffer = await file.arrayBuffer();
                    buffer = Buffer.from(arrayBuffer);
                  } else {
                    throw new Error('Invalid file format');
                  }
                  
                  let llmResult;
                  
                  if (file.type === 'application/pdf') {
                    // Handle PDF files with text extraction (like ChatGPT backend)
                    logger.info('Processing PDF file with text extraction', { fileName: file.name });
                    
                    try {
                      // First try to extract text from PDF
                      const pdfResult = await documentService.extractTextFromBuffer(buffer);
                      
                      if (pdfResult.success && documentService.isTextMeaningful(pdfResult.text)) {
                        // Process the extracted text with LLM
                        const formattedContent = documentService.formatPDFContent(pdfResult.text, pdfResult.metadata);
                        const prompt = `${text || 'Please analyze this PDF document:'}\n\n${formattedContent}`;
                        
                        llmResult = await llmService.processTextWithSkill(
                          prompt,
                          this.activeSkill,
                          sessionHistory.recent,
                          needsProgrammingLanguage ? this.codingLanguage : null
                        );
                        
                        // Add metadata about PDF processing
                        llmResult.metadata.isPdfAnalysis = true;
                        llmResult.metadata.pdfPages = pdfResult.metadata.pages;
                        
                      } else {
                        throw new Error('Could not extract meaningful text from PDF - may contain mainly images or complex formatting');
                      }
                    } catch (pdfError) {
                      logger.warn('PDF text extraction failed, providing helpful guidance', { error: pdfError.message });
                      
                      // Provide helpful message like ChatGPT would
                      llmResult = {
                        response: `I can see you've uploaded a PDF file "${file.name}". While I have PDF processing capabilities, this particular PDF seems to contain complex formatting, images, or be image-based.

For the best results with this PDF, try:

📸 **Convert to Images**: Take screenshots of the PDF pages and upload them as image files - I can analyze those perfectly!

📝 **Copy Text**: If there's text content you'd like me to analyze, you can copy and paste it directly into our chat.

🔄 **Retry**: Sometimes re-uploading the PDF can help if there was a processing issue.

I'm here to help analyze your content once it's in a format I can process effectively!`,
                        metadata: {
                          processingTime: 0,
                          usedFallback: true,
                          isPdfAnalysis: true,
                          pdfProcessingFailed: true
                        }
                      };
                    }
                  } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                           file.type === 'application/msword' || 
                           file.name.endsWith('.docx') || 
                           file.name.endsWith('.doc')) {
                    // Handle Word documents with text extraction
                    logger.info('Processing Word document', { fileName: file.name });
                    const wordResult = await documentService.extractTextFromWordBuffer(buffer);
                    
                    if (wordResult.success && documentService.isTextMeaningful(wordResult.text)) {
                      // Process the extracted text with LLM
                      const formattedContent = documentService.formatWordContent(wordResult.text, wordResult.metadata);
                      const prompt = `${text || 'Please analyze this Word document:'}\n\n${formattedContent}`;
                      
                      llmResult = await llmService.processTextWithSkill(
                        prompt,
                        this.activeSkill,
                        sessionHistory.recent,
                        needsProgrammingLanguage ? this.codingLanguage : null
                      );
                      
                      // Add metadata about Word processing
                      llmResult.metadata.isWordAnalysis = true;
                      llmResult.metadata.wordTextLength = wordResult.metadata.textLength;
                      
                    } else {
                      throw new Error(wordResult.error || 'Could not extract meaningful text from Word document');
                    }
                  } else {
                    // Handle images and other visual content
                    llmResult = await llmService.processImageWithSkill(
                      buffer,
                      file.type,
                      this.activeSkill,
                      sessionHistory.recent,
                      needsProgrammingLanguage ? this.codingLanguage : null
                    );
                  }

                  // Send response to ChatGPT window
                  const chatGPTWindow = windowManager.getWindow('chatgpt');
                  if (chatGPTWindow && !chatGPTWindow.isDestroyed()) {
                    chatGPTWindow.webContents.send('llm-response', {
                      response: llmResult.response,
                      metadata: llmResult.metadata
                    });
                  }

                  sessionManager.addModelResponse(llmResult.response, {
                    skill: this.activeSkill,
                    processingTime: llmResult.metadata.processingTime,
                    usedFallback: llmResult.metadata.usedFallback,
                    isChatResponse: true,
                    isImageAnalysis: true
                  });
                } catch (imageError) {
                  logger.error('Failed to process image file', { error: imageError.message, fileName: file.name });
                  // Send error response
                  const chatGPTWindow = windowManager.getWindow('chatgpt');
                  if (chatGPTWindow && !chatGPTWindow.isDestroyed()) {
                    const isImageFile = file.type && file.type.startsWith('image/');
                    const isPdfFile = file.type === 'application/pdf';
                    const isDocFile = file.type && (file.type.includes('document') || file.type.includes('word') || file.name.endsWith('.docx') || file.name.endsWith('.doc'));
                    
                    let errorMessage;
                    if (isPdfFile) {
                      errorMessage = `I can see you've uploaded a PDF file "${file.name}". While I have advanced analysis capabilities, I need the PDF to be converted to images or have its text extracted for me to analyze the content effectively. 

For best results with PDFs, try:
1. Taking screenshots of the PDF pages and uploading those as images
2. Converting the PDF to images first
3. Copy-pasting the text content from the PDF into our chat

I apologize for this limitation and appreciate your understanding.`;
                    } else if (isDocFile) {
                      errorMessage = `I can see you've uploaded a Word document "${file.name}". While I have advanced analysis capabilities, I cannot directly process Word documents through the visual interface.

For best results with Word documents, try:
1. Copy-pasting the text content from the document into our chat
2. Converting the document to images/screenshots and uploading those
3. Saving as a plain text file and uploading that instead

I'd be happy to analyze the content once you provide it in a supported format!`;
                    } else if (isImageFile) {
                      // This is an image file that failed processing - show appropriate error
                      errorMessage = `I encountered an issue processing the image "${file.name}" (${file.type || 'unknown format'}). 

This could be due to:
1. File corruption or invalid format
2. Unsupported image variant
3. Network connectivity issues

Please try:
1. Re-saving the image in a standard format (PNG, JPG)
2. Uploading a different image
3. Checking your internet connection

Error details: ${imageError.message}`;
                    } else {
                      errorMessage = `I can see you've uploaded "${file.name}" (${file.type || 'unknown format'}). I can only directly process image files (PNG, JPG, GIF, etc.) through my visual interface.

For best results, try:
1. Copy-pasting text content directly into our chat
2. Converting documents to images/screenshots
3. Using supported image formats (PNG, JPG, GIF, etc.)

I'd be happy to help analyze your content once it's in a supported format!`;
                    }
                    
                    chatGPTWindow.webContents.send('llm-response', {
                      response: errorMessage,
                      metadata: { processingTime: 0, usedFallback: true }
                    });
                  }
                }
              } else {
                // For non-image files, read content and process as text
                try {
                  let fileContent = '';
                  if (file.type === 'text/plain') {
                    let arrayBuffer;
                    if (file.data && Array.isArray(file.data)) {
                      // Handle serialized file data from frontend
                      arrayBuffer = new Uint8Array(file.data).buffer;
                    } else if (file.arrayBuffer) {
                      // Handle original File object
                      arrayBuffer = await file.arrayBuffer();
                    } else {
                      throw new Error('Invalid file format');
                    }
                    fileContent = new TextDecoder().decode(arrayBuffer);
                  } else {
                    fileContent = `[File: ${file.name}, Type: ${file.type}, Size: ${file.size} bytes]`;
                  }
                  
                  const combinedText = text ? `${text}\n\nFile content:\n${fileContent}` : `Analyzing file: ${file.name}\n\n${fileContent}`;
                  
                  // Process with LLM
                  const sessionHistory = sessionManager.getOptimizedHistory();
                  const skillsRequiringProgrammingLanguage = ['dsa'];
                  const needsProgrammingLanguage = skillsRequiringProgrammingLanguage.includes(this.activeSkill);
                  
                  const llmResult = await llmService.processTextWithSkill(
                    combinedText,
                    this.activeSkill,
                    sessionHistory.recent,
                    needsProgrammingLanguage ? this.codingLanguage : null
                  );

                  // Send response to ChatGPT window
                  const chatGPTWindow = windowManager.getWindow('chatgpt');
                  if (chatGPTWindow && !chatGPTWindow.isDestroyed()) {
                    chatGPTWindow.webContents.send('llm-response', {
                      response: llmResult.response,
                      metadata: llmResult.metadata
                    });
                  }

                  sessionManager.addModelResponse(llmResult.response, {
                    skill: this.activeSkill,
                    processingTime: llmResult.metadata.processingTime,
                    usedFallback: llmResult.metadata.usedFallback,
                    isChatResponse: true
                  });
                } catch (fileError) {
                  logger.error('Failed to process file', { error: fileError.message, fileName: file.name });
                  // Send error response
                  const chatGPTWindow = windowManager.getWindow('chatgpt');
                  if (chatGPTWindow && !chatGPTWindow.isDestroyed()) {
                    chatGPTWindow.webContents.send('llm-response', {
                      response: `I apologize, but I encountered an error processing the file "${file.name}". Please try uploading the file again.`,
                      metadata: { processingTime: 0, usedFallback: true }
                    });
                  }
                }
              }
            }
          } catch (error) {
            logger.error("Failed to process files", {
              error: error.message,
              fileCount: files.length
            });
            
            // Send fallback response
            const chatGPTWindow = windowManager.getWindow('chatgpt');
            if (chatGPTWindow && !chatGPTWindow.isDestroyed()) {
              chatGPTWindow.webContents.send('llm-response', {
                response: 'I\'m here and ready to help! However, I encountered an issue processing your files. Please try uploading them again.',
                metadata: { processingTime: 0, usedFallback: true }
              });
            }
          }
        }, 500);
      } else if (text) {
        // If no files but text provided, process normally
        setTimeout(async () => {
          try {
            const sessionHistory = sessionManager.getOptimizedHistory();
            const response = await llmService.generateContentDirect(`You are J.A.R.V.I.X, Tony Stark's AI assistant. You are intelligent, helpful, sophisticated, and have a slight British accent in your responses. Please respond helpfully to this message: ${text}`);
            
            const chatGPTWindow = windowManager.getWindow('chatgpt');
            if (chatGPTWindow && !chatGPTWindow.isDestroyed()) {
              chatGPTWindow.webContents.send('llm-response', {
                response: response,
                metadata: { processingTime: Date.now(), usedFallback: false }
              });
            }

            sessionManager.addModelResponse(response, {
              skill: 'general',
              processingTime: Date.now(),
              usedFallback: false,
              isChatResponse: true
            });
          } catch (error) {
            logger.error("Failed to process text message", {
              error: error.message,
              text: text.substring(0, 100)
            });
          }
        }, 500);
      }
      
      return { success: true };
    });

    ipcMain.handle("get-skill-prompt", (event, skillName) => {
      try {
        const { promptLoader } = require('./prompt-loader');
        const skillPrompt = promptLoader.getSkillPrompt(skillName);
        return skillPrompt;
      } catch (error) {
        logger.error('Failed to get skill prompt', { skillName, error: error.message });
        return null;
      }
    });

    ipcMain.handle("set-openai-api-key", (event, apiKey) => {
      llmService.updateApiKey(apiKey);
      return llmService.getStats();
    });

    ipcMain.handle("get-openai-status", () => {
      return llmService.getStats();
    });

    // Window binding IPC handlers
    ipcMain.handle("set-window-binding", (event, enabled) => {
      return windowManager.setWindowBinding(enabled);
    });

    ipcMain.handle("toggle-window-binding", () => {
      return windowManager.toggleWindowBinding();
    });

    ipcMain.handle("get-window-binding-status", () => {
      return windowManager.getWindowBindingStatus();
    });

    ipcMain.handle("get-window-stats", () => {
      return windowManager.getWindowStats();
    });

    ipcMain.handle("set-window-gap", (event, gap) => {
      return windowManager.setWindowGap(gap);
    });

    ipcMain.handle("move-bound-windows", (event, { deltaX, deltaY }) => {
      windowManager.moveBoundWindows(deltaX, deltaY);
      return windowManager.getWindowBindingStatus();
    });

    ipcMain.handle("test-openai-connection", async () => {
      return await llmService.testConnection();
    });

    ipcMain.handle("run-openai-diagnostics", async () => {
      try {
        const apiTest = await llmService.testConnection();
        
        return {
          success: true,
          apiTest,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    });

    // Auth window handlers
    ipcMain.handle("show-auth", async () => {
      await windowManager.showAuth();
      return { success: true };
    });

    ipcMain.handle("hide-auth", () => {
      windowManager.hideAuth();
      return { success: true };
    });

    // Settings handlers
    ipcMain.handle("show-settings", () => {
      windowManager.showSettings();

      // Send current settings to the settings window
      const settingsWindow = windowManager.getWindow("settings");
      if (settingsWindow) {
        const currentSettings = this.getSettings();
        setTimeout(() => {
          settingsWindow.webContents.send("load-settings", currentSettings);
        }, 100);
      }

      return { success: true };
    });

    ipcMain.handle("get-settings", () => {
      return this.getSettings();
    });

    ipcMain.handle("save-settings", (event, settings) => {
      return this.saveSettings(settings);
    });

    ipcMain.handle("update-app-icon", (event, iconKey) => {
      return this.updateAppIcon(iconKey);
    });

    ipcMain.handle("update-active-skill", (event, skill) => {
      this.activeSkill = skill;
      windowManager.broadcastToAllWindows("skill-changed", { skill });
      return { success: true };
    });

    ipcMain.handle("restart-app-for-stealth", () => {
      // Force restart the app to ensure stealth name changes take effect
      const { app } = require("electron");
      app.relaunch();
      app.exit();
    });

    ipcMain.handle("close-window", (event) => {
      const webContents = event.sender;
      const window = windowManager.windows.forEach((win, type) => {
        if (win.webContents === webContents) {
          win.hide();
          return true;
        }
      });
      return { success: true };
    });

    // LLM window specific handlers
    ipcMain.handle("expand-llm-window", (event, contentMetrics) => {
      windowManager.expandLLMWindow(contentMetrics);
      return { success: true, contentMetrics };
    });

    ipcMain.handle("resize-llm-window-for-content", (event, contentMetrics) => {
      // Use the same expansion logic for now, can be enhanced later
      windowManager.expandLLMWindow(contentMetrics);
      return { success: true, contentMetrics };
    });

    // Header double-click handler for window enlargement
    ipcMain.on("header-double-click", (event, windowType) => {
      windowManager.toggleWindowSize(windowType);
    });

    ipcMain.handle("minimize-window", (event) => {
      const webContents = event.sender;
      const browserWindow = BrowserWindow.fromWebContents(webContents);
      
      if (browserWindow) {
        browserWindow.minimize();
        logger.debug("Window minimized via IPC");
        return { success: true };
      } else {
        logger.warn("Could not find window to minimize");
        return { success: false, error: "Window not found" };
      }
    });

    ipcMain.handle("quit-app", () => {
      logger.info("Quit app requested via IPC");
      try {
        // Force quit the application
        const { app } = require("electron");

        // Close all windows first
        windowManager.destroyAllWindows();

        // Unregister shortcuts
        globalShortcut.unregisterAll();

        // Force quit
        app.quit();

        // If the above doesn't work, force exit
        setTimeout(() => {
          process.exit(0);
        }, 2000);
      } catch (error) {
        logger.error("Error during quit:", error);
        process.exit(1);
      }
    });

    // Handle close settings
    ipcMain.on("close-settings", () => {
      const settingsWindow = windowManager.getWindow("settings");
      if (settingsWindow) {
        settingsWindow.hide();
      }
    });

    // Handle save settings (synchronous)
    ipcMain.on("save-settings", (event, settings) => {
      this.saveSettings(settings);
    });

    // Handle update skill
    ipcMain.on("update-skill", (event, skill) => {
      this.activeSkill = skill;
      windowManager.broadcastToAllWindows("skill-updated", { skill });
    });

    // Handle quit app (alternative method)
    ipcMain.on("quit-app", () => {
      logger.info("Quit app requested via IPC (on method)");
      try {
        const { app } = require("electron");
        windowManager.destroyAllWindows();
        globalShortcut.unregisterAll();
        app.quit();
        setTimeout(() => process.exit(0), 1000);
      } catch (error) {
        logger.error("Error during quit (on method):", error);
        process.exit(1);
      }
    });

    // Payment and subscription handlers
    ipcMain.handle("initiate-premium-upgrade", async (event, plan = 'monthly') => {
      try {
        const result = await paymentService.initiatePremiumUpgrade(plan);
        return result;
      } catch (error) {
        logger.error("Failed to initiate premium upgrade", { error: error.message, plan });
        return {
          success: false,
          error: error.message,
          message: 'Failed to initiate premium upgrade. Please try again.'
        };
      }
    });

    ipcMain.handle("check-premium-status", async () => {
      try {
        const status = await paymentService.checkPremiumStatus();
        return status;
      } catch (error) {
        logger.error("Failed to check premium status", { error: error.message });
        return {
          isPremium: false,
          status: 'error',
          message: 'Unable to verify premium status'
        };
      }
    });

    ipcMain.handle("cancel-subscription", async () => {
      try {
        const result = await paymentService.cancelSubscription();
        return result;
      } catch (error) {
        logger.error("Failed to cancel subscription", { error: error.message });
        return {
          success: false,
          message: 'Failed to cancel subscription. Please contact support.'
        };
      }
    });

    ipcMain.handle("get-subscription-management", async () => {
      try {
        const management = await paymentService.getSubscriptionManagement();
        return management;
      } catch (error) {
        logger.error("Failed to get subscription management", { error: error.message });
        return {
          hasSubscription: false,
          message: 'Unable to load subscription information',
          error: error.message
        };
      }
    });

    // Authentication handlers
    ipcMain.handle("auth-sign-up", async (event, email, password) => {
      try {
        const result = await supabaseService.signUp(email, password);
        return result;
      } catch (error) {
        logger.error("Failed to sign up user", { error: error.message, email });
        return {
          success: false,
          error: error.message
        };
      }
    });

    ipcMain.handle("auth-sign-in", async (event, email, password) => {
      try {
        const result = await supabaseService.signIn(email, password);
        return result;
      } catch (error) {
        logger.error("Failed to sign in user", { error: error.message, email });
        return {
          success: false,
          error: error.message
        };
      }
    });

    ipcMain.handle("auth-sign-out", async () => {
      try {
        const result = await supabaseService.signOut();
        return result;
      } catch (error) {
        logger.error("Failed to sign out user", { error: error.message });
        return {
          success: false,
          error: error.message
        };
      }
    });

    ipcMain.handle("auth-get-user", () => {
      const user = supabaseService.getCurrentUser();
      return {
        isAuthenticated: supabaseService.isAuthenticated(),
        user: user ? { id: user.id, email: user.email } : null
      };
    });

    // New auth contract for React renderer
    ipcMain.handle("auth-google-signin", async (event) => {
      try {

        // Get the OAuth URL from Supabase
        const urlResult = await supabaseService.signInWithGoogle();
        
        if (!urlResult.success || !urlResult.url) {
          throw new Error('Failed to generate OAuth URL');
        }

        // Create a popup window for Google OAuth
        const authWindow = new BrowserWindow({
          width: 500,
          height: 600,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false
          },
          show: true,
          modal: true,
          parent: windowManager.getWindow('chatgpt'),
          autoHideMenuBar: true,
          title: 'Sign in with Google'
        });

        // Load the OAuth URL
        await authWindow.loadURL(urlResult.url);

        const result = await new Promise((resolve) => {
          const handleCallback = async (navigationUrl) => {
            try {
              const url = new URL(navigationUrl);
              // Check if this is the callback URL or contains access_token
              if (url.pathname === '/auth/v1/callback' || url.hash.includes('access_token=')) {
                const params = new URLSearchParams(url.hash.substring(1));
                const accessToken = params.get('access_token');
                const refreshToken = params.get('refresh_token');
                if (accessToken && refreshToken) {
                  try {
                    const sessionResult = await supabaseService.handleOAuthCallback(accessToken, refreshToken);
                    authWindow.close();
                    resolve({ success: true, user: sessionResult.user });
                    return;
                  } catch (err) {
                    logger.error('Failed to handle OAuth callback', { error: err.message });
                    authWindow.close();
                    resolve({ success: false, error: 'Failed to complete authentication' });
                    return;
                  }
                }
              }

              // If URL contains localhost:3000, prevent the navigation
              if (url.hostname === 'localhost' && url.port === '3000') {
                logger.warn('Prevented navigation to localhost:3000, extracting tokens from current URL');
                const currentUrl = authWindow.webContents.getURL();
                if (currentUrl.includes('access_token=')) {
                  await handleCallback(currentUrl);
                }
              }
            } catch (err) {
              logger.error('Error handling callback URL', { error: err.message, url: navigationUrl });
            }
          };

          authWindow.webContents.on('will-redirect', async (e, navigationUrl) => {
            await handleCallback(navigationUrl);
          });
          authWindow.webContents.on('did-navigate', async (e, navigationUrl) => {
            await handleCallback(navigationUrl);
          });
          authWindow.webContents.on('did-finish-load', async () => {
            const currentUrl = authWindow.webContents.getURL();
            await handleCallback(currentUrl);
          });
          authWindow.webContents.on('did-fail-load', async (e, errorCode, errorDescription, validatedURL) => {
            if (validatedURL.includes('access_token=')) {
              await handleCallback(validatedURL);
            }
          });

          authWindow.on('closed', () => {
            resolve({ success: false, error: 'Authentication window closed' });
          });
        });

        if (!result.success) {
          event.sender.send('auth-login-failed', result.error || 'Authentication failed');
          return { success: false, error: result.error };
        }

        // Emit success event to renderer with cached session
        const session = supabaseService.getCachedSession();
        if (session) {
          event.sender.send('auth-login-success', session);
        }
        return { success: true };

      } catch (error) {
        logger.error("Failed to initiate Google sign-in", { error: error.message });

        // Try to extract tokens from error message (common with localhost redirect)
        if (error.message && error.message.includes('access_token=')) {
          try {
            const urlMatch = error.message.match(/loading '([^']+)'/);
            if (urlMatch && urlMatch[1]) {
              const url = new URL(urlMatch[1]);
              const params = new URLSearchParams(url.hash.substring(1));
              const accessToken = params.get('access_token');
              const refreshToken = params.get('refresh_token');
              if (accessToken && refreshToken) {
                const sessionResult = await supabaseService.handleOAuthCallback(accessToken, refreshToken);
                const session = supabaseService.getCachedSession();
                if (session) event.sender.send('auth-login-success', session);
                return { success: true };
              }
            }
          } catch (parseError) {
            logger.error('Failed to parse tokens from error message', { error: parseError.message });
          }
        }

        event.sender.send('auth-login-failed', error.message);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("auth-signout", async (event) => {
      try {
        await supabaseService.signOut();
        supabaseService.clearSession();
        
        // Emit logout event to renderer
        event.sender.send('auth-logged-out');
        
        return { success: true };
      } catch (error) {
        logger.error("Sign out failed", { error: error.message });
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("auth-get-cached-session", () => {
      try {
        const session = supabaseService.getCachedSession();
        return session;
      } catch (error) {
        logger.error("Failed to get cached session", { error: error.message });
        return null;
      }
    });

    ipcMain.handle("auth-ensure-device-registered", async () => {
      try {
        await supabaseService.ensureDeviceRegistered();
        return { success: true };
      } catch (error) {
        logger.error("Failed to register device", { error: error.message });
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("auth-audit", async (event, auditEvent) => {
      try {
        await supabaseService.auditAuthEvent(auditEvent);
        return { success: true };
      } catch (error) {
        logger.error("Failed to audit auth event", { error: error.message, event: auditEvent });
        return { success: false, error: error.message };
      }
    });

    // Google OAuth temporarily disabled
    /*
    ipcMain.handle("auth-google-sign-in", async () => {
      try {
        // Get the OAuth URL from Supabase
        const urlResult = await supabaseService.signInWithGoogle();
        
        if (!urlResult.success || !urlResult.url) {
          throw new Error('Failed to generate OAuth URL');
        }

        // Create a popup window for Google OAuth
        const authWindow = new BrowserWindow({
          width: 500,
          height: 600,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false
          },
          show: true,
          modal: true,
          parent: windowManager.getWindow('chatgpt'),
          autoHideMenuBar: true,
          title: 'Sign in with Google'
        });

        // Load the OAuth URL
        await authWindow.loadURL(urlResult.url);

        return new Promise((resolve) => {
          // Handle the callback URL - check both redirect and navigation events
          const handleCallback = async (navigationUrl) => {
            try {
              const url = new URL(navigationUrl);
              
              // Check if this is the callback URL or contains access_token
              if (url.pathname === '/auth/v1/callback' || url.hash.includes('access_token=')) {
                // Parse the hash fragment for tokens
                const params = new URLSearchParams(url.hash.substring(1));
                const accessToken = params.get('access_token');
                const refreshToken = params.get('refresh_token');

                if (accessToken && refreshToken) {
                  try {
                    // Set the session in Supabase
                    const sessionResult = await supabaseService.handleOAuthCallback(accessToken, refreshToken);
                    
                    authWindow.close();
                    resolve({
                      success: true,
                      user: sessionResult.user
                    });
                    return;
                  } catch (error) {
                    logger.error('Failed to handle OAuth callback', { error: error.message });
                    authWindow.close();
                    resolve({
                      success: false,
                      error: 'Failed to complete authentication'
                    });
                    return;
                  }
                }
              }
              
              // If URL contains localhost:3000, prevent the navigation
              if (url.hostname === 'localhost' && url.port === '3000') {
                logger.warn('Prevented navigation to localhost:3000, extracting tokens from current URL');
                // Extract tokens from the current URL
                const currentUrl = authWindow.webContents.getURL();
                if (currentUrl.includes('access_token=')) {
                  await handleCallback(currentUrl);
                }
              }
            } catch (error) {
              logger.error('Error handling callback URL', { error: error.message, url: navigationUrl });
            }
          };

          // Listen for redirects
          authWindow.webContents.on('will-redirect', async (event, navigationUrl) => {
            await handleCallback(navigationUrl);
          });

          // Listen for navigation events
          authWindow.webContents.on('did-navigate', async (event, navigationUrl) => {
            await handleCallback(navigationUrl);
          });

          // Listen for page finish loading
          authWindow.webContents.on('did-finish-load', async () => {
            const currentUrl = authWindow.webContents.getURL();
            await handleCallback(currentUrl);
          });

          // Handle navigation errors (like ERR_CONNECTION_REFUSED to localhost:3000)
          authWindow.webContents.on('did-fail-load', async (event, errorCode, errorDescription, validatedURL) => {
            // Check if the URL contains access tokens even though it failed to load
            if (validatedURL.includes('access_token=')) {
              await handleCallback(validatedURL);
            }
          });

          // Handle window closed
          authWindow.on('closed', () => {
            resolve({
              success: false,
              error: 'Authentication window closed'
            });
          });
        });

      } catch (error) {
        logger.error("Failed to initiate Google sign-in", { error: error.message });
        
        // Check if the error message contains access tokens (common with localhost redirect issues)
        if (error.message && error.message.includes('access_token=')) {
          try {
            // Extract the URL from the error message
            const urlMatch = error.message.match(/loading '([^']+)'/);
            if (urlMatch && urlMatch[1]) {
              const url = new URL(urlMatch[1]);
              const params = new URLSearchParams(url.hash.substring(1));
              const accessToken = params.get('access_token');
              const refreshToken = params.get('refresh_token');

              if (accessToken && refreshToken) {
                logger.info('Extracted tokens from error message, attempting authentication');
                const sessionResult = await supabaseService.handleOAuthCallback(accessToken, refreshToken);
                
                return {
                  success: true,
                  user: sessionResult.user
                };
              }
            }
          } catch (parseError) {
            logger.error('Failed to parse tokens from error message', { error: parseError.message });
          }
        }
        
        return {
          success: false,
          error: error.message
        };
      }
    });
    */
  }

  buildPremiumUpgradeMessage(fileName, upgradePrompt) {
    if (!upgradePrompt) {
      return `I can see you've uploaded "${fileName}". Image processing requires a premium subscription. Please upgrade to access this feature.`;
    }

    const { title, message, features, plans } = upgradePrompt;
    
    let upgradeMessage = `**${title}**\n\n${message}\n\n`;
    
    if (features && features.length > 0) {
      upgradeMessage += `**Features included:**\n${features.map(f => `• ${f}`).join('\n')}\n\n`;
    }
    
    if (plans) {
      upgradeMessage += `**Choose your plan:**\n\n`;
      
      if (plans.monthly) {
        upgradeMessage += `**${plans.monthly.name}** - ${plans.monthly.price}\n`;
      }
      
      if (plans.yearly) {
        upgradeMessage += `**${plans.yearly.name}** - ${plans.yearly.price}`;
        if (plans.yearly.savings) {
          upgradeMessage += ` (${plans.yearly.savings})`;
        }
        upgradeMessage += '\n';
      }
      
      upgradeMessage += '\nClick "Upgrade to Premium" below to get started! 🚀';
    }
    
    return upgradeMessage;
  }

  toggleSpeechRecognition() {
    const isAvailable = typeof speechService.isAvailable === 'function' ? speechService.isAvailable() : !!speechService.getStatus?.().isInitialized;
    if (!isAvailable) {
      logger.warn("Speech recognition unavailable; toggle ignored");
      try {
        windowManager.broadcastToAllWindows("speech-status", { status: 'Speech recognition unavailable', available: false });
        windowManager.broadcastToAllWindows("speech-availability", { available: false });
      } catch (e) {}
      return;
    }
    const currentStatus = speechService.getStatus();
    if (currentStatus.isRecording) {
      try {
        speechService.stopRecording();
        windowManager.hideChatWindow();
        logger.info("Speech recognition stopped via global shortcut");
      } catch (error) {
        logger.error("Error stopping speech recognition:", error);
      }
    } else {
      try {
        speechService.startRecording();
        windowManager.showChatWindow();
        logger.info("Speech recognition started via global shortcut");
      } catch (error) {
        logger.error("Error starting speech recognition:", error);
      }
    }
  }

  clearSessionMemory() {
    try {
      sessionManager.clear();
      windowManager.broadcastToAllWindows("session-cleared");
      logger.info("Session memory cleared via global shortcut");
    } catch (error) {
      logger.error("Error clearing session memory:", error);
    }
  }

  handleUpArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (isInteractive) {
      // Interactive mode: Navigate to previous skill
      this.navigateSkill(-1);
    } else {
      // Non-interactive mode: Move window up
      windowManager.moveBoundWindows(0, -20);
    }
  }

  handleDownArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (isInteractive) {
      // Interactive mode: Navigate to next skill
      this.navigateSkill(1);
    } else {
      // Non-interactive mode: Move window down
      windowManager.moveBoundWindows(0, 20);
    }
  }

  handleLeftArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (!isInteractive) {
      // Non-interactive mode: Move window left
      windowManager.moveBoundWindows(-20, 0);
    }
    // Interactive mode: Left arrow does nothing
  }

  handleRightArrow() {
    const isInteractive = windowManager.getWindowStats().isInteractive;

    if (!isInteractive) {
      // Non-interactive mode: Move window right
      windowManager.moveBoundWindows(20, 0);
    }
    // Interactive mode: Right arrow does nothing
  }

  navigateSkill(direction) {
    const availableSkills = [
      "dsa",
    ];

    const currentIndex = availableSkills.indexOf(this.activeSkill);
    if (currentIndex === -1) {
      logger.warn("Current skill not found in available skills", {
        currentSkill: this.activeSkill,
        availableSkills,
      });
      return;
    }

    // Calculate new index with wrapping
    let newIndex = currentIndex + direction;
    if (newIndex >= availableSkills.length) {
      newIndex = 0; // Wrap to beginning
    } else if (newIndex < 0) {
      newIndex = availableSkills.length - 1; // Wrap to end
    }

    const newSkill = availableSkills[newIndex];
    this.activeSkill = newSkill;

    // Update session manager with the new skill
    sessionManager.setActiveSkill(newSkill);

    logger.info("Skill navigated via global shortcut", {
      from: availableSkills[currentIndex],
      to: newSkill,
      direction: direction > 0 ? "down" : "up",
    });

    // Broadcast the skill change to all windows
    windowManager.broadcastToAllWindows("skill-updated", { skill: newSkill });
  }

  async triggerScreenshotOCR() {
    if (!this.isReady) {
      logger.warn("Screenshot requested before application ready");
      return;
    }

    const startTime = Date.now();

    try {
      windowManager.showLLMLoading();

  const capture = await captureService.captureAndProcess();

      if (!capture.imageBuffer || !capture.imageBuffer.length) {
        windowManager.hideLLMResponse();
        this.broadcastOCRError("Failed to capture screenshot image");
        return;
      }

      // Use image directly with LLM and active skill; do not send chat messages here
      const sessionHistory = sessionManager.getOptimizedHistory();

      const skillsRequiringProgrammingLanguage = ['dsa'];
      const needsProgrammingLanguage = skillsRequiringProgrammingLanguage.includes(this.activeSkill);

      const llmResult = await llmService.processImageWithSkill(
        capture.imageBuffer,
        capture.mimeType || 'image/png',
        this.activeSkill,
        sessionHistory.recent,
        needsProgrammingLanguage ? this.codingLanguage : null
      );

      // Record model response in session
      sessionManager.addModelResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback,
        isImageAnalysis: true
      });

      windowManager.showLLMResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback,
        isImageAnalysis: true
      });

      this.broadcastLLMSuccess(llmResult);
    } catch (error) {
      logger.error("Screenshot OCR process failed", {
        error: error.message,
        duration: Date.now() - startTime,
      });

      windowManager.hideLLMResponse();
      this.broadcastOCRError(error.message);
      
      sessionManager.addConversationEvent({
        role: 'system',
        content: `Screenshot OCR failed: ${error.message}`,
        action: 'ocr_error',
        metadata: {
          error: error.message
        }
      });
    }
  }

  async processWithLLM(text, sessionHistory) {
    try {
      // Add user input to session memory
      sessionManager.addUserInput(text, 'llm_input');

      // Check if current skill needs programming language context
      const skillsRequiringProgrammingLanguage = ['dsa'];
      const needsProgrammingLanguage = skillsRequiringProgrammingLanguage.includes(this.activeSkill);
      
      const llmResult = await llmService.processTextWithSkill(
        text,
        this.activeSkill,
        sessionHistory.recent,
        needsProgrammingLanguage ? this.codingLanguage : null
      );

      logger.info("LLM processing completed, showing response", {
        responseLength: llmResult.response.length,
        skill: this.activeSkill,
        programmingLanguage: needsProgrammingLanguage ? this.codingLanguage : 'not applicable',
        processingTime: llmResult.metadata.processingTime,
        responsePreview: llmResult.response.substring(0, 200) + "...",
      });

      // Add LLM response to session memory
      sessionManager.addModelResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback,
      });

      windowManager.showLLMResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback,
      });

      this.broadcastLLMSuccess(llmResult);
    } catch (error) {
      logger.error("LLM processing failed", {
        error: error.message,
        skill: this.activeSkill,
      });

      windowManager.hideLLMResponse();
      sessionManager.addConversationEvent({
        role: 'system',
        content: `LLM processing failed: ${error.message}`,
        action: 'llm_error',
        metadata: {
          error: error.message,
          skill: this.activeSkill
        }
      });

      this.broadcastLLMError(error.message);
    }
  }

  async processTranscriptionWithLLM(text, sessionHistory) {
    try {
      // Validate input text
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        logger.warn("Skipping LLM processing for empty or invalid transcription", {
          textType: typeof text,
          textLength: text ? text.length : 0
        });
        return;
      }

      const cleanText = text.trim();
      if (cleanText.length < 2) {
        logger.debug("Skipping LLM processing for very short transcription", {
          text: cleanText
        });
        return;
      }

      logger.info("Processing transcription with intelligent LLM response", {
        skill: this.activeSkill,
        textLength: cleanText.length,
        textPreview: cleanText.substring(0, 100) + "..."
      });

      // Check if current skill needs programming language context
      const skillsRequiringProgrammingLanguage = ['dsa'];
      const needsProgrammingLanguage = skillsRequiringProgrammingLanguage.includes(this.activeSkill);

      const llmResult = await llmService.processTranscriptionWithIntelligentResponse(
        cleanText,
        this.activeSkill,
        sessionHistory.recent,
        needsProgrammingLanguage ? this.codingLanguage : null
      );

      // Add LLM response to session memory
      sessionManager.addModelResponse(llmResult.response, {
        skill: this.activeSkill,
        processingTime: llmResult.metadata.processingTime,
        usedFallback: llmResult.metadata.usedFallback,
        isTranscriptionResponse: true
      });

      // Send response to chat windows
      this.broadcastTranscriptionLLMResponse(llmResult);

      logger.info("Transcription LLM response completed", {
        responseLength: llmResult.response.length,
        skill: this.activeSkill,
        programmingLanguage: needsProgrammingLanguage ? this.codingLanguage : 'not applicable',
        processingTime: llmResult.metadata.processingTime
      });

    } catch (error) {
      logger.error("Transcription LLM processing failed", {
        error: error.message,
        errorStack: error.stack,
        skill: this.activeSkill,
        text: text ? text.substring(0, 100) : 'undefined'
      });

      // Try to provide a fallback response
      try {
        const fallbackResult = llmService.generateIntelligentFallbackResponse(text, this.activeSkill);
        
        sessionManager.addModelResponse(fallbackResult.response, {
          skill: this.activeSkill,
          processingTime: fallbackResult.metadata.processingTime,
          usedFallback: true,
          isTranscriptionResponse: true,
          fallbackReason: error.message
        });

        this.broadcastTranscriptionLLMResponse(fallbackResult);
        
        logger.info("Used fallback response for transcription", {
          skill: this.activeSkill,
          fallbackResponse: fallbackResult.response
        });
        
      } catch (fallbackError) {
        logger.error("Fallback response also failed", {
          fallbackError: fallbackError.message
        });

        sessionManager.addConversationEvent({
          role: 'system',
          content: `Transcription LLM processing failed: ${error.message}`,
          action: 'transcription_llm_error',
          metadata: {
            error: error.message,
            skill: this.activeSkill
          }
        });
      }
    }
  }

  broadcastOCRSuccess(ocrResult) {
    windowManager.broadcastToAllWindows("ocr-completed", {
      text: ocrResult.text,
      metadata: ocrResult.metadata,
    });
  }

  broadcastOCRError(errorMessage) {
    windowManager.broadcastToAllWindows("ocr-error", {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastLLMSuccess(llmResult) {
    const broadcastData = {
      response: llmResult.response,
      metadata: llmResult.metadata,
      skill: this.activeSkill, // Add the current active skill to the top level
    };

    logger.info("Broadcasting LLM success to all windows", {
      responseLength: llmResult.response.length,
      skill: this.activeSkill,
      dataKeys: Object.keys(broadcastData),
      responsePreview: llmResult.response.substring(0, 100) + "...",
    });

    windowManager.broadcastToAllWindows("llm-response", broadcastData);
  }

  broadcastLLMError(errorMessage) {
    windowManager.broadcastToAllWindows("llm-error", {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastTranscriptionLLMResponse(llmResult) {
    const broadcastData = {
      response: llmResult.response,
      metadata: llmResult.metadata,
      skill: this.activeSkill,
      isTranscriptionResponse: true
    };

    logger.info("Broadcasting transcription LLM response to all windows", {
      responseLength: llmResult.response.length,
      skill: this.activeSkill,
      responsePreview: llmResult.response.substring(0, 100) + "..."
    });

    windowManager.broadcastToAllWindows("transcription-llm-response", broadcastData);
  }

  onWindowAllClosed() {
    // Always quit when all windows are closed (including macOS)
    app.quit();
  }

  onActivate() {
    if (!this.isReady) {
      this.onAppReady();
    } else {
      // When app is activated, ensure windows appear on current desktop
      const mainWindow = windowManager.getWindow("main");
      if (mainWindow && mainWindow.isVisible()) {
        windowManager.showOnCurrentDesktop(mainWindow);
      }

      // Also handle other visible windows
      windowManager.windows.forEach((window, type) => {
        if (window.isVisible()) {
          windowManager.showOnCurrentDesktop(window);
        }
      });

      logger.debug("App activated - ensured windows appear on current desktop");
    }
  }

  onBeforeQuit() {
    logger.info("Application before quit - starting cleanup");
    
    try {
      // Unregister all global shortcuts immediately
      globalShortcut.unregisterAll();
      
      // Hide all windows first
      windowManager.hideAllWindows();
      
    } catch (error) {
      logger.error("Error during before quit cleanup", { error: error.message });
    }
  }

  onWillQuit() {
    logger.info("Application will quit - final cleanup");
    
    try {
      // Destroy all windows
      windowManager.destroyAllWindows();
      
      // Force exit after short delay if app doesn't quit properly
      setTimeout(() => {
        process.exit(0);
      }, 500);
      
    } catch (error) {
      logger.error("Error during quit cleanup", { error: error.message });
      process.exit(1);
    }

    const sessionStats = sessionManager.getMemoryUsage();
    logger.info("Application shutting down", {
      sessionEvents: sessionStats.eventCount,
      sessionSize: sessionStats.approximateSize,
    });
  }

  getSettings() {
    return {
      codingLanguage: this.codingLanguage || "javascript", // Default to JavaScript
      activeSkill: this.activeSkill || "general",
      appIcon: this.appIcon || "terminal",
      selectedIcon: this.appIcon || "terminal",
      // pass through env-derived settings for UI convenience (masked)
      azureConfigured: !!process.env.AZURE_SPEECH_KEY && !!process.env.AZURE_SPEECH_REGION,
      speechAvailable: this.speechAvailable
    };
  }
  
  saveSettings(settings) {
    try {
      // Update application settings
      if (settings.codingLanguage) {
        this.codingLanguage = settings.codingLanguage;
        // Broadcast language change to all windows for sync
        windowManager.broadcastToAllWindows("coding-language-changed", {
          language: settings.codingLanguage,
        });
      }
      if (settings.activeSkill) {
        this.activeSkill = settings.activeSkill;
        // Broadcast skill change to all windows
        windowManager.broadcastToAllWindows("skill-updated", {
          skill: settings.activeSkill,
        });
      }
      if (settings.appIcon) {
        this.appIcon = settings.appIcon;
      }

      // Handle icon change specifically
      if (settings.selectedIcon) {
        this.appIcon = settings.selectedIcon;
        // Immediately update the app icon
        this.updateAppIcon(settings.selectedIcon);
      }

      // Persist settings to file or config
      this.persistSettings(settings);

      logger.info("Settings saved successfully", settings);
      return { success: true };
    } catch (error) {
      logger.error("Failed to save settings", { error: error.message });
      return { success: false, error: error.message };
    }
  }

  persistSettings(settings) {
    // You can extend this to save to a file or database
    // For now, we'll just keep them in memory
    logger.debug("Settings persisted", settings);
  }

  updateAppIcon(iconKey) {
    try {
      const { app } = require("electron");
      const path = require("path");
      const fs = require("fs");

      // Force jarvis icon only - no other icons allowed
      iconKey = "jarvis";

      // Icon mapping for available icons in assests/icons folder
      const iconPaths = {
        jarvis: "assests/icons/jarvis.png",
        terminal: "assests/icons/terminal.png",
        activity: "assests/icons/activity.png",
        settings: "assests/icons/settings.png"
      };

      // App name mapping for stealth mode
      const appNames = {
        jarvis: "JARVIX ",
        terminal: "Terminal ",
        activity: "Activity Monitor ",
        settings: "System Settings "
      };

      const iconPath = iconPaths[iconKey];
      const appName = appNames[iconKey];

      if (!iconPath) {
        logger.error("Invalid icon key", { iconKey });
        return { success: false, error: "Invalid icon key" };
      }

      const fullIconPath = path.join(__dirname, iconPath);

      if (!fs.existsSync(fullIconPath)) {
        logger.error("Icon file not found", {
          iconKey,
          iconPath: fullIconPath,
        });
        return { success: false, error: "Icon file not found" };
      }

      // Set app icon for dock/taskbar
      if (process.platform === "darwin") {
        // macOS - update dock icon
        app.dock.setIcon(fullIconPath);

        // Force dock refresh with multiple attempts
        setTimeout(() => {
          app.dock.setIcon(fullIconPath);
        }, 100);

        setTimeout(() => {
          app.dock.setIcon(fullIconPath);
        }, 500);
      } else {
        // Windows/Linux - update window icons
        windowManager.windows.forEach((window, type) => {
          if (window && !window.isDestroyed()) {
            window.setIcon(fullIconPath);
          }
        });
      }

      // Update app name for stealth mode
      this.updateAppName(appName, iconKey);

      logger.info("App icon and name updated successfully", {
        iconKey,
        appName,
        iconPath: fullIconPath,
        platform: process.platform,
        fileExists: fs.existsSync(fullIconPath),
      });

      this.appIcon = iconKey;
      return { success: true };
    } catch (error) {
      logger.error("Failed to update app icon", {
        error: error.message,
        stack: error.stack,
      });
      return { success: false, error: error.message };
    }
  }

  updateAppName(appName, iconKey) {
    try {
      const { app } = require("electron");

      // Force update process title for Activity Monitor stealth - CRITICAL
      process.title = appName;

      // Set app name in dock (macOS) - this affects the dock and Activity Monitor
      if (process.platform === "darwin") {
        // Multiple attempts to ensure the name sticks
        app.setName(appName);

        // Force update the bundle name for macOS stealth
        const { execSync } = require("child_process");
        try {
          // Update the app's Info.plist CFBundleName in memory
          if (process.mainModule && process.mainModule.filename) {
            const appPath = process.mainModule.filename;
            // Force set the bundle name directly
            process.env.CFBundleName = appName.trim();
          }
        } catch (e) {
          // Silently fail if we can't modify bundle info
        }

        // Clear dock badge and reset
        if (app.dock) {
          app.dock.setBadge("");
          // Force dock refresh
          setTimeout(() => {
            app.dock.setIcon(
              require("path").join(__dirname, `assests/icons/${iconKey}.png`)
            );
          }, 50);
        }
      }

      // Set app user model ID for Windows taskbar grouping
      app.setAppUserModelId(`${appName.trim()}-${iconKey}`);

      // Update all window titles to match the new app name
      const windows = windowManager.windows;
      windows.forEach((window, type) => {
        if (window && !window.isDestroyed()) {
          // Use stealth name for all windows
          const stealthTitle = appName.trim();
          window.setTitle(stealthTitle);
        }
      });

      // Multiple force refreshes with increasing delays
      const refreshTimes = [50, 100, 200, 500];
      refreshTimes.forEach((delay) => {
        setTimeout(() => {
          process.title = appName;
          if (process.platform === "darwin") {
            app.setName(appName);
            // Force update bundle display name
            if (app.getName() !== appName) {
              app.setName(appName);
            }
          }
        }, delay);
      });

      logger.info("App name updated for stealth mode", {
        appName,
        processTitle: process.title,
        appGetName: app.getName(),
        iconKey,
        platform: process.platform,
      });
    } catch (error) {
      logger.error("Failed to update app name", { error: error.message });
    }
  }
}

new ApplicationController();
