// ChatGPT-style Window UI Controller
class ChatGPTWindowUI {
  constructor() {
    this.isStreaming = false;
    this.isInteractive = true;
    this.currentProvider = 'gemini';
    this.temperature = 0.7;
    this.messages = [];
    this.attachedFiles = [];
    
    this.init();
  }

  async init() {
    this.setupElements();
    this.setupEventListeners();
    this.updateChatTitle();
    
    // Add a welcome message
    this.addMessage('assistant', 'Good day, sir. I\'m J.A.R.V.I.X, your AI assistant. I can help you with a wide variety of tasks including answering questions, writing, coding, analysis, and creative projects. How may I assist you today?');
    
    console.log('[ChatGPT] Window initialized');
  }

  setupElements() {
    // Main chat elements
    this.chatTitle = document.getElementById('chatTitle');
    this.chatMessages = document.getElementById('chatMessages');
    this.providerSelector = document.getElementById('providerSelector');
    this.temperatureSlider = document.getElementById('temperatureSlider');
    this.temperatureValue = document.getElementById('temperatureValue');
    
    // Composer elements
    this.composerInput = document.getElementById('composerInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.stopBtn = document.getElementById('stopBtn');
    this.attachBtn = document.getElementById('attachBtn');
    this.fileInput = document.getElementById('fileInput');
    this.attachmentPreview = document.getElementById('attachmentPreview');
    
    // Other elements
    this.appContainer = document.getElementById('appContainer');
    this.clickThroughBanner = document.getElementById('clickThroughBanner');
    
    // Debug logging and validation
    console.log('[ChatGPT] Send button element:', this.sendBtn);
    console.log('[ChatGPT] Composer input element:', this.composerInput);
    console.log('[ChatGPT] ElectronAPI available:', !!window.electronAPI);
    
    // Validate critical elements
    if (!this.sendBtn) {
      console.error('[ChatGPT] Send button not found!');
    }
    if (!this.composerInput) {
      console.error('[ChatGPT] Composer input not found!');
    }
    if (!this.chatMessages) {
      console.error('[ChatGPT] Chat messages container not found!');
    }
    if (!this.attachBtn) {
      console.error('[ChatGPT] Attach button not found!');
    }
    if (!this.fileInput) {
      console.error('[ChatGPT] File input not found!');
    }
  }

  setupEventListeners() {
    // Chat controls (with null checks)
    if (this.providerSelector) {
      this.providerSelector.addEventListener('change', (e) => this.changeProvider(e.target.value));
    }
    if (this.temperatureSlider) {
      this.temperatureSlider.addEventListener('input', (e) => this.updateTemperature(e.target.value));
    }
    
    // Composer events (with null checks)
    if (this.composerInput) {
      this.composerInput.addEventListener('input', () => this.autoResizeComposer());
      this.composerInput.addEventListener('keydown', (e) => this.handleComposerKeydown(e));
      this.composerInput.addEventListener('paste', (e) => this.handlePaste(e));
    }
    
    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => {
        console.log('[ChatGPT] Send button clicked');
        this.sendMessage();
      });
    } else {
      console.error('[ChatGPT] Cannot setup send button event - element not found');
    }
    
    if (this.stopBtn) {
      this.stopBtn.addEventListener('click', () => this.stopGeneration());
    }
    
    // Attachment events
    if (this.attachBtn) {
      this.attachBtn.addEventListener('click', () => {
        console.log('[ChatGPT] Attach button clicked');
        this.fileInput.click();
      });
    }
    
    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        console.log('[ChatGPT] Files selected:', e.target.files.length);
        this.handleFileSelect(e.target.files);
      });
    }
    
    // Global events
    document.addEventListener('keydown', (e) => this.handleGlobalKeydown(e));
    
    // Electron API events
    if (window.electronAPI) {
      window.electronAPI.onInteractionModeChanged((event, interactive) => {
        this.handleInteractionModeChanged(interactive);
      });
      
      window.electronAPI.onLlmResponse((event, data) => {
        this.handleLLMResponse(data);
      });
      
      window.electronAPI.onTranscriptionLlmResponse((event, data) => {
        this.handleTranscriptionLLMResponse(data);
      });

      window.electronAPI.onTranscriptionReceived((event, data) => {
        if (data && data.text) {
          this.addMessage('user', data.text);
          this.startStreaming();
        }
      });
    }
  }

  // Clear chat functionality
  clearChat() {
    this.messages = [];
    this.chatMessages.innerHTML = '';
    this.addMessage('assistant', 'Good day, sir. I\'m J.A.R.V.I.X, your AI assistant. I can help you with a wide variety of tasks including answering questions, writing, coding, analysis, and creative projects. How may I assist you today?');
  }

  // Rendering
  renderMessages() {
    this.chatMessages.innerHTML = '';
    
    this.messages.forEach(message => {
      this.addMessageToUI(message.role, message.content, false);
    });
    
    this.scrollToBottom();
  }

  addMessageToUI(role, content, animate = true) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    if (animate) {
      messageDiv.style.opacity = '0';
      messageDiv.style.transform = 'translateY(10px)';
    }
    
    const avatar = role === 'user' ? 'U' : 'AI';
    const isLastAssistantMessage = role === 'assistant' && 
      this.chatMessages.lastElementChild?.classList.contains('assistant');
    
    messageDiv.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-content">
        <div class="message-text"></div>
        <div class="message-actions">
          <button class="message-action-btn" onclick="chatUI.copyMessage(this)">
            <i class="fas fa-copy"></i>
            Copy
          </button>
          ${role === 'assistant' && isLastAssistantMessage ? `
            <button class="message-action-btn" onclick="chatUI.regenerateResponse()">
              <i class="fas fa-redo"></i>
              Regenerate
            </button>
          ` : ''}
        </div>
      </div>
    `;
    
    this.chatMessages.appendChild(messageDiv);
    
    if (animate) {
      requestAnimationFrame(() => {
        messageDiv.style.transition = 'all 0.3s ease-out';
        messageDiv.style.opacity = '1';
        messageDiv.style.transform = 'translateY(0)';
      });
    }
    
    // Add typewriter effect for assistant messages
    if (role === 'assistant') {
      this.typewriterEffect(messageDiv.querySelector('.message-text'), content);
    } else {
      // For user messages, show immediately
      messageDiv.querySelector('.message-text').innerHTML = this.formatMessageContent(content);
    }
    
    this.scrollToBottom();
  }

  // Typewriter effect for assistant responses
  typewriterEffect(element, content, speed = 5, charsPerFrame = 2) {
    const formattedContent = this.formatMessageContent(content);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = formattedContent;
    const plainText = tempDiv.textContent || tempDiv.innerText || '';
    
    let index = 0;
    element.innerHTML = '';
    
    const typeNextChars = () => {
      if (index < plainText.length) {
        // Add multiple characters at once for faster typing
        for (let i = 0; i < charsPerFrame && index < plainText.length; i++) {
          element.textContent += plainText.charAt(index);
          index++;
        }
        this.scrollToBottom();
        setTimeout(typeNextChars, speed);
      } else {
        // Once typing is complete, set the full formatted content
        element.innerHTML = formattedContent;
        this.scrollToBottom();
      }
    };
    
    typeNextChars();
  }

  // Message handling
  sendMessage() {
    console.log('[ChatGPT] sendMessage() called');
    const content = this.composerInput.value.trim();
    console.log('[ChatGPT] Message content:', content);
    console.log('[ChatGPT] Is streaming:', this.isStreaming);
    console.log('[ChatGPT] Attached files:', this.attachedFiles.length);
    
    if (!content && this.attachedFiles.length === 0) {
      console.log('[ChatGPT] Aborting send: empty content/attachments');
      return;
    }
    
    // Create message with attachments info
    let messageText = content;
    if (this.attachedFiles.length > 0) {
      const fileList = this.attachedFiles.map(att => `📎 ${att.name}`).join('\n');
      messageText = content ? `${content}\n\n${fileList}` : fileList;
    }
    
    // Add user message
    this.addMessage('user', messageText);
    this.composerInput.value = '';
    this.autoResizeComposer();
    
    // Start streaming response
    this.startStreaming();
    this.sendToLLM(content);
  }

  addMessage(role, content) {
    const message = {
      role,
      content,
      timestamp: new Date().toISOString()
    };
    
    this.messages.push(message);
    this.addMessageToUI(role, content);
  }

  async sendToLLM(content) {
    try {
      console.log('[ChatGPT] Sending to LLM:', content);
      console.log('[ChatGPT] Attached files:', this.attachedFiles.length);
      console.log('[ChatGPT] ElectronAPI available:', !!window.electronAPI);
      console.log('[ChatGPT] sendChatMessage function available:', !!(window.electronAPI && window.electronAPI.sendChatMessage));
      
      if (this.attachedFiles.length > 0 && window.electronAPI && window.electronAPI.sendChatMessageWithFiles) {
        console.log('[ChatGPT] Converting files for IPC...');
        
        // Convert files to serializable format
        const serializedFiles = await Promise.all(
          this.attachedFiles.map(async (attachment) => {
            const arrayBuffer = await attachment.file.arrayBuffer();
            return {
              name: attachment.name,
              type: attachment.type,
              size: attachment.size,
              data: Array.from(new Uint8Array(arrayBuffer))
            };
          })
        );
        
        console.log('[ChatGPT] Calling electronAPI.sendChatMessageWithFiles with serialized files');
        await window.electronAPI.sendChatMessageWithFiles(content, serializedFiles);
      } else if (window.electronAPI && window.electronAPI.sendChatMessage) {
        console.log('[ChatGPT] Calling electronAPI.sendChatMessage');
        await window.electronAPI.sendChatMessage(content);
      } else {
        console.warn('[ChatGPT] ElectronAPI not available, using fallback');
        // Fallback for when electronAPI is not available
        this.stopStreaming();
        this.addMessage('assistant', `Echo: ${content}\n\nI'm here and ready to help! Please ask me anything you'd like assistance with.`);
      }
      
      // Clear attachments after sending
      this.clearAttachments();
    } catch (error) {
      console.error('[ChatGPT] Failed to send message:', error);
      this.stopStreaming();
      this.addMessage('assistant', `Error occurred while sending message: ${error.message}\n\nI'm here and ready to help! Please ask me anything you'd like assistance with.`);
      // Clear attachments even on error
      this.clearAttachments();
    }
  }

  handleLLMResponse(data) {
    if (data && data.response) {
      this.stopStreaming();
      this.addMessage('assistant', data.response);
    }
  }

  handleTranscriptionLLMResponse(data) {
    if (data && data.response) {
      this.stopStreaming();
      this.addMessage('assistant', data.response);
    }
  }

  // Streaming UI
  startStreaming() {
    this.isStreaming = true;
    this.sendBtn.style.display = 'none';
    this.stopBtn.style.display = 'flex';
    // Keep input enabled so user can continue typing
    
    // Add typing indicator
    this.addTypingIndicator();
  }

  stopStreaming() {
    this.isStreaming = false;
    this.sendBtn.style.display = 'flex';
    this.stopBtn.style.display = 'none';
    // Input stays enabled for continuous typing
    
    // Remove typing indicator
    this.removeTypingIndicator();
    this.composerInput.focus();
  }

  stopGeneration() {
    // TODO: Implement stop generation in LLM service
    this.stopStreaming();
  }

  addTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant typing-indicator';
    typingDiv.id = 'typing-indicator';
    
    typingDiv.innerHTML = `
      <div class="message-avatar">AI</div>
      <div class="message-content">
        <div class="message-text">
          <div class="typing-indicator">
            <div class="typing-dots">
              <div class="typing-dot"></div>
              <div class="typing-dot"></div>
              <div class="typing-dot"></div>
            </div>
            <div class="blinking-caret"></div>
          </div>
        </div>
      </div>
    `;
    
    this.chatMessages.appendChild(typingDiv);
    this.scrollToBottom();
  }

  removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  // UI Actions
  copyMessage(button) {
    const messageText = button.closest('.message-content').querySelector('.message-text');
    const text = messageText.textContent;
    
    if (window.electronAPI && window.electronAPI.copyToClipboard) {
      window.electronAPI.copyToClipboard(text).then(success => {
        if (success) {
          button.innerHTML = '<i class="fas fa-check"></i> Copied';
          setTimeout(() => {
            button.innerHTML = '<i class="fas fa-copy"></i> Copy';
          }, 2000);
        }
      });
    }
  }

  regenerateResponse() {
    if (this.messages.length === 0) return;
    
    // Remove last assistant message
    const lastMessage = this.messages[this.messages.length - 1];
    if (lastMessage.role === 'assistant') {
      this.messages.pop();
    }
    
    // Get the user message to regenerate response for
    const userMessage = this.messages[this.messages.length - 1];
    if (userMessage && userMessage.role === 'user') {
      this.renderMessages();
      this.startStreaming();
      this.sendToLLM(userMessage.content);
    }
  }

  // Settings
  changeProvider(provider) {
    this.currentProvider = provider;
    console.log('[ChatGPT] Provider changed to:', provider);
    // TODO: Integrate with settings system
  }

  updateTemperature(value) {
    this.temperature = parseFloat(value);
    this.temperatureValue.textContent = value;
    console.log('[ChatGPT] Temperature updated to:', this.temperature);
    // TODO: Integrate with settings system
  }

  // Interaction mode
  handleInteractionModeChanged(interactive) {
    this.isInteractive = interactive;
    
    if (interactive) {
      this.appContainer.classList.remove('non-interactive');
      this.clickThroughBanner.classList.remove('show');
    } else {
      this.appContainer.classList.add('non-interactive');
      this.clickThroughBanner.classList.add('show');
    }
  }

  // Event handlers
  handleComposerKeydown(e) {
    console.log('[ChatGPT] Key pressed:', e.key, 'Shift:', e.shiftKey);
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      console.log('[ChatGPT] Enter key pressed - sending message');
      this.sendMessage();
    }
  }

  handlePaste(e) {
    console.log('[ChatGPT] Paste event detected');
    const clipboardData = e.clipboardData || window.clipboardData;
    const items = clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Check if the item is an image
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault(); // Prevent default paste behavior for images
        
        const file = item.getAsFile();
        if (file) {
          console.log('[ChatGPT] Image pasted:', file.name, file.type, file.size);
          
          // Create a mock attachment object similar to file upload
          const attachment = {
            id: Date.now() + Math.random(),
            file: file,
            name: file.name || `pasted-image-${Date.now()}.png`,
            type: file.type,
            size: file.size
          };
          
          // Add to attachments
          this.attachedFiles.push(attachment);
          this.updateAttachmentPreview();
          
          console.log('[ChatGPT] Image attachment added from paste');
        }
        break; // Only handle the first image
      }
    }
  }

  handleGlobalKeydown(e) {
    // Esc for click-through mode
    if (e.key === 'Escape') {
      if (window.electronAPI && window.electronAPI.toggleInteraction) {
        window.electronAPI.toggleInteraction();
      }
    }
    
    // Cmd/Ctrl+K for composer
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      this.composerInput.focus();
    }
    
    // Cmd/Ctrl+L to clear chat
    if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
      e.preventDefault();
      this.clearChat();
    }
  }

  autoResizeComposer() {
    if (!this.composerInput) return;
    
    const minHeight = 32;
    const maxHeight = 80;
    
    // Reset height to measure content
    this.composerInput.style.height = minHeight + 'px';
    
    // Calculate new height
    const scrollHeight = this.composerInput.scrollHeight;
    const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
    
    // Only update if height changed significantly to prevent jitter
    const currentHeight = parseInt(this.composerInput.style.height) || minHeight;
    if (Math.abs(newHeight - currentHeight) > 2) {
      this.composerInput.style.height = newHeight + 'px';
    }
  }

  updateChatTitle() {
    this.chatTitle.textContent = 'J.A.R.V.I.X';
  }

  scrollToBottom() {
    requestAnimationFrame(() => {
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    });
  }

  formatMessageContent(content) {
    // Basic markdown formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // File attachment methods
  handleFileSelect(files) {
    if (!files || files.length === 0) return;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (this.isValidFile(file)) {
        this.addAttachment(file);
      } else {
        console.warn('[ChatGPT] Invalid file type:', file.name, file.type);
      }
    }
    
    this.updateAttachmentPreview();
    this.fileInput.value = ''; // Reset file input
  }
  
  isValidFile(file) {
    const maxSize = 10 * 1024 * 1024; // 10MB limit
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'text/plain', 'application/pdf', 'application/json',
      'text/html', 'text/css', 'text/javascript', 'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    
    if (file.size > maxSize) {
      alert(`File "${file.name}" is too large. Maximum size is 10MB.`);
      return false;
    }
    
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(txt|md|js|py|html|css|json)$/i)) {
      alert(`File type "${file.type}" is not supported.`);
      return false;
    }
    
    return true;
  }
  
  addAttachment(file) {
    const attachment = {
      id: Date.now() + Math.random(),
      file: file,
      name: file.name,
      type: file.type,
      size: file.size
    };
    
    this.attachedFiles.push(attachment);
    console.log('[ChatGPT] Added attachment:', attachment.name);
  }
  
  removeAttachment(attachmentId) {
    this.attachedFiles = this.attachedFiles.filter(att => att.id !== attachmentId);
    this.updateAttachmentPreview();
    console.log('[ChatGPT] Removed attachment:', attachmentId);
  }
  
  updateAttachmentPreview() {
    if (!this.attachmentPreview) return;
    
    if (this.attachedFiles.length === 0) {
      this.attachmentPreview.style.display = 'none';
      this.attachmentPreview.innerHTML = '';
      return;
    }
    
    this.attachmentPreview.style.display = 'flex';
    this.attachmentPreview.innerHTML = this.attachedFiles.map(attachment => `
      <div class="attachment-item">
        <i class="fas ${this.getFileIcon(attachment.type)}"></i>
        <span class="attachment-name" title="${attachment.name}">${attachment.name}</span>
        <button class="attachment-remove" onclick="chatUI.removeAttachment(${attachment.id})" title="Remove">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join('');
  }
  
  getFileIcon(fileType) {
    if (fileType.startsWith('image/')) return 'fa-image';
    if (fileType === 'application/pdf') return 'fa-file-pdf';
    if (fileType.includes('word') || fileType.includes('document')) return 'fa-file-word';
    if (fileType === 'application/json' || fileType.includes('javascript')) return 'fa-file-code';
    if (fileType === 'text/plain' || fileType === 'text/markdown') return 'fa-file-text';
    return 'fa-file';
  }
  
  clearAttachments() {
    this.attachedFiles = [];
    this.updateAttachmentPreview();
    console.log('[ChatGPT] Cleared all attachments');
  }
}

// Initialize when DOM is ready
let chatUI;
document.addEventListener('DOMContentLoaded', () => {
  chatUI = new ChatGPTWindowUI();
  window.chatUI = chatUI; // For debugging
});