const logger = require('../core/logger').createServiceLogger('SESSION');
const config = require('../core/config');
const { promptLoader } = require('../../prompt-loader');

class SessionManager {
  constructor() {
    this.sessionMemory = [];
    this.compressionEnabled = true;
    this.maxSize = config.get('session.maxMemorySize');
    this.compressionThreshold = config.get('session.compressionThreshold');
    this.currentSkill = 'general'; // Default skill is general
    this.isInitialized = false;
    
    this.initializeWithSkillPrompts();
  }

  /**
   * Initialize session memory with all available skill prompts
   */
  async initializeWithSkillPrompts() {
    if (this.isInitialized) return;
    
    try {
      // Load prompts from the prompt loader
      promptLoader.loadPrompts();
      const availableSkills = promptLoader.getAvailableSkills();
      
      // Add initial system context for each skill
      for (const skill of availableSkills) {
        const skillPrompt = promptLoader.getSkillPrompt(skill);
        if (skillPrompt) {
          const event = this.createConversationEvent({
            role: 'system',
            content: skillPrompt,
            skill: skill,
            action: 'skill_prompt_initialization',
            metadata: {
              isInitialization: true,
              skillName: skill
            }
          });
          this.sessionMemory.push(event);
        }
      }
      
      this.isInitialized = true;
      logger.info('Session memory initialized with skill prompts', {
        skillCount: availableSkills.length,
        totalEvents: this.sessionMemory.length
      });
      
    } catch (error) {
      logger.error('Failed to initialize session memory with skill prompts', {
        error: error.message
      });
    }
  }

  /**
   * Set the current active skill
   */
  setActiveSkill(skill) {
    const previousSkill = this.currentSkill;
    this.currentSkill = skill;
    
    this.addConversationEvent({
      role: 'system',
      content: `Switched to ${skill} mode`,
      action: 'skill_change',
      metadata: {
        previousSkill,
        newSkill: skill
      }
    });
    
    logger.info('Active skill changed', { 
      from: previousSkill, 
      to: skill 
    });
  }

  /**
   * Add a conversation event with proper role classification
   */
  addConversationEvent({ role, content, action = null, metadata = {} }) {
    const event = this.createConversationEvent({
      role,
      content,
      skill: this.currentSkill,
      action: action || this.inferActionFromRole(role),
      metadata
    });
    
    this.sessionMemory.push(event);
    
    logger.debug('Conversation event added', {
      role,
      action: event.action,
      skill: this.currentSkill,
      contentLength: content?.length || 0,
      totalEvents: this.sessionMemory.length
    });

    this.performMaintenanceIfNeeded();
    return event.id;
  }

  /**
   * Add user transcription or chat input
   */
  addUserInput(text, source = 'chat') {
    return this.addConversationEvent({
      role: 'user',
      content: text,
      action: source === 'speech' ? 'speech_transcription' : 'chat_input',
      metadata: {
        source,
        textLength: text.length
      }
    });
  }

  /**
   * Add LLM/model response
   */
  addModelResponse(text, metadata = {}) {
    return this.addConversationEvent({
      role: 'model',
      content: text,
      action: 'llm_response',
      metadata: {
        ...metadata,
        responseLength: text.length
      }
    });
  }

  /**
   * Add OCR extracted text
   */
  addOCREvent(extractedText, metadata = {}) {
    return this.addConversationEvent({
      role: 'user',
      content: extractedText,
      action: 'ocr_extraction',
      metadata: {
        ...metadata,
        source: 'screenshot',
        textLength: extractedText.length
      }
    });
  }

  /**
   * Create a conversation event with consistent structure
   */
  createConversationEvent({ role, content, skill, action, metadata = {} }) {
    return {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      role: role, // 'user', 'model', or 'system'
      content,
      skill: skill || this.currentSkill,
      action,
      category: this.categorizeAction(action),
      metadata: {
        ...metadata,
        contentLength: content?.length || 0
      },
      contextSummary: this.generateContextSummary(action, { 
        role, 
        content, 
        skill: skill || this.currentSkill,
        ...metadata 
      })
    };
  }

  /**
   * Infer action from role
   */
  inferActionFromRole(role) {
    switch (role) {
      case 'user': return 'user_message';
      case 'model': return 'model_response';
      case 'system': return 'system_message';
      default: return 'unknown';
    }
  }

  /**
   * Get conversation history for LLM context with improved referencing
   */
  getConversationHistory(maxEntries = 20) {
    // Get recent conversation events (excluding system initialization)
    const conversationEvents = this.sessionMemory
      .filter(event => event.role !== 'system' || !event.metadata?.isInitialization)
      .slice(-maxEntries);
    
    return conversationEvents.map(event => ({
      role: event.role,
      content: event.content,
      timestamp: event.timestamp,
      skill: event.skill,
      action: event.action,
      id: event.id
    }));
  }

  /**
   * Get enhanced conversation context with better referencing
   */
  getEnhancedConversationContext(maxEntries = 15) {
    const conversationEvents = this.sessionMemory
      .filter(event => event.role !== 'system' || !event.metadata?.isInitialization);
    
    // Get recent events for immediate context
    const recentEvents = conversationEvents.slice(-maxEntries);
    
    // Find conversation threads and important context
    const contextualEvents = this.findContextualReferences(conversationEvents);
    
    // Combine recent + contextual events, removing duplicates
    const allRelevantEvents = [...contextualEvents, ...recentEvents]
      .filter((event, index, arr) => arr.findIndex(e => e.id === event.id) === index)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    return {
      conversation: allRelevantEvents.map(event => ({
        role: event.role,
        content: event.content,
        timestamp: event.timestamp,
        skill: event.skill,
        action: event.action,
        id: event.id,
        isContextual: contextualEvents.some(ce => ce.id === event.id)
      })),
      summary: this.generateConversationSummary(allRelevantEvents),
      threadInfo: this.analyzeConversationThreads(allRelevantEvents)
    };
  }

  /**
   * Find contextually relevant events that should be included for better understanding
   */
  findContextualReferences(allEvents) {
    const contextualEvents = [];
    
    // Look for events with follow-up questions or clarifications
    const recentUserInputs = allEvents
      .filter(event => event.role === 'user')
      .slice(-5); // Last 5 user inputs
    
    for (const userInput of recentUserInputs) {
      const content = userInput.content.toLowerCase();
      
      // Check for reference keywords
      const referenceKeywords = [
        'you said', 'you mentioned', 'earlier', 'before', 'previous', 
        'that answer', 'your response', 'you told me', 'what you said',
        'from before', 'remember when', 'like you said', 'as you mentioned'
      ];
      
      const hasReference = referenceKeywords.some(keyword => content.includes(keyword));
      
      if (hasReference) {
        // Find the conversation pair (user input + AI response) that this might be referencing
        const eventIndex = allEvents.findIndex(e => e.id === userInput.id);
        const contextWindow = allEvents.slice(Math.max(0, eventIndex - 10), eventIndex);
        
        // Add the most recent AI response before this reference
        const lastAiResponse = contextWindow
          .filter(e => e.role === 'model')
          .pop();
        
        if (lastAiResponse && !contextualEvents.some(ce => ce.id === lastAiResponse.id)) {
          contextualEvents.push(lastAiResponse);
          
          // Also add the user input that prompted that response
          const responseIndex = allEvents.findIndex(e => e.id === lastAiResponse.id);
          const promptingInput = allEvents
            .slice(0, responseIndex)
            .filter(e => e.role === 'user')
            .pop();
          
          if (promptingInput && !contextualEvents.some(ce => ce.id === promptingInput.id)) {
            contextualEvents.push(promptingInput);
          }
        }
      }
    }
    
    return contextualEvents;
  }

  /**
   * Generate a summary of conversation context for better referencing
   */
  generateConversationSummary(events) {
    const topics = new Set();
    const skills = new Set();
    let hasCode = false;
    let hasImageAnalysis = false;
    
    // Validate events array
    if (!Array.isArray(events)) {
      return {
        topics: [],
        skills: [],
        hasCode: false,
        hasImageAnalysis: false,
        eventCount: 0,
        timeSpan: null
      };
    }
    
    events.forEach(event => {
      // Ensure event exists and has required properties
      if (!event || typeof event !== 'object') {
        return;
      }
      
      if (event.skill) {
        skills.add(event.skill);
      }
      
      if (event.content && typeof event.content === 'string') {
        const content = event.content.toLowerCase();
        
        // Detect code discussions
        if (content.includes('```') || content.includes('function') || content.includes('class')) {
          hasCode = true;
        }
        
        // Detect image analysis
        if (event.action === 'ocr_extraction' || content.includes('image') || content.includes('screenshot')) {
          hasImageAnalysis = true;
        }
        
        // Extract potential topics (simple keyword extraction)
        const words = content.split(/\s+/)
          .filter(word => word && word.length > 4 && !['that', 'this', 'with', 'from', 'have', 'been', 'will'].includes(word))
          .slice(0, 3);
        words.forEach(word => topics.add(word));
      }
    });
    
    return {
      topics: Array.from(topics).slice(0, 5),
      skills: Array.from(skills),
      hasCode,
      hasImageAnalysis,
      eventCount: events.length,
      timeSpan: events.length > 0 && events[0] && events[events.length - 1] ? {
        start: events[0].timestamp,
        end: events[events.length - 1].timestamp
      } : null
    };
  }

  /**
   * Analyze conversation threads to understand flow and references
   */
  analyzeConversationThreads(events) {
    const threads = [];
    let currentThread = null;
    
    events.forEach(event => {
      if (event.role === 'user') {
        // Start new thread or continue existing one
        if (!currentThread || this.isNewTopic(event, currentThread)) {
          if (currentThread) {
            threads.push(currentThread);
          }
          currentThread = {
            id: event.id,
            topic: this.extractTopic(event.content),
            skill: event.skill,
            events: [event],
            startTime: event.timestamp
          };
        } else {
          currentThread.events.push(event);
        }
      } else if (event.role === 'model' && currentThread) {
        currentThread.events.push(event);
        currentThread.endTime = event.timestamp;
      }
    });
    
    if (currentThread) {
      threads.push(currentThread);
    }
    
    return {
      threads: threads.slice(-3), // Keep last 3 conversation threads
      currentThread: currentThread,
      threadCount: threads.length
    };
  }

  /**
   * Determine if a user input represents a new topic or continues the current thread
   */
  isNewTopic(event, currentThread) {
    if (!currentThread || currentThread.events.length === 0) return true;
    
    const content = event.content.toLowerCase();
    const lastUserInput = currentThread.events
      .filter(e => e.role === 'user')
      .pop();
    
    if (!lastUserInput) return true;
    
    const lastContent = lastUserInput.content.toLowerCase();
    
    // Check for continuation indicators
    const continuationWords = ['also', 'and', 'but', 'however', 'what about', 'how about'];
    const hasContinuation = continuationWords.some(word => content.includes(word));
    
    // Check for reference words that indicate same topic
    const referenceWords = ['it', 'this', 'that', 'they', 'these', 'those'];
    const hasReference = referenceWords.some(word => content.startsWith(word));
    
    // Check for question words that might be follow-ups
    const followupQuestions = ['why', 'how', 'what if', 'can you', 'could you'];
    const isFollowup = followupQuestions.some(phrase => content.includes(phrase));
    
    // Different skill = likely new topic
    if (event.skill !== currentThread.skill) return true;
    
    // Short responses that seem like follow-ups
    if (content.length < 50 && (hasContinuation || hasReference || isFollowup)) return false;
    
    // Time gap > 5 minutes suggests new topic
    const timeDiff = new Date(event.timestamp) - new Date(lastUserInput.timestamp);
    if (timeDiff > 5 * 60 * 1000) return true;
    
    return false; // Default to continuing thread
  }

  /**
   * Extract a simple topic identifier from content
   */
  extractTopic(content) {
    const words = content.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3 && !/^(the|and|but|for|are|this|that|with|from)$/.test(word))
      .slice(0, 2);
    
    return words.join(' ') || 'general';
  }

  /**
   * Get the entire conversation history (excluding initialization system messages)
   * This is useful when the model needs complete context for each new message.
   */
  getFullConversationHistory() {
    const conversationEvents = this.sessionMemory
      .filter(event => event.role !== 'system' || !event.metadata?.isInitialization);

    return conversationEvents.map(event => ({
      role: event.role,
      content: event.content,
      timestamp: event.timestamp,
      skill: event.skill,
      action: event.action
    }));
  }

  /**
   * Get skill-specific context with optional programming language support
   * @param {string|null} skillName - Target skill name (defaults to current skill)
   * @param {string|null} programmingLanguage - Optional programming language for injection
   */
  getSkillContext(skillName = null, programmingLanguage = null) {
    const targetSkill = skillName || this.currentSkill;
    
    // Get skill prompt with programming language injection if provided
    let skillPrompt = null;
    if (programmingLanguage && promptLoader.requiresProgrammingLanguage(targetSkill)) {
      // Use prompt loader to get language-enhanced prompt
      skillPrompt = promptLoader.getSkillPrompt(targetSkill, programmingLanguage);
    } else {
      // Find skill prompt from session memory (fallback)
      const skillPromptEvent = this.sessionMemory.find(event => 
        event.action === 'skill_prompt_initialization' && 
        event.skill === targetSkill
      );
      skillPrompt = skillPromptEvent?.content || null;
    }
    
    // Get recent events for this skill
    const skillEvents = this.sessionMemory
      .filter(event => event.skill === targetSkill && !event.metadata?.isInitialization)
      .slice(-10);
    
    return {
      skillPrompt,
      recentEvents: skillEvents,
      currentSkill: targetSkill,
      programmingLanguage,
      requiresProgrammingLanguage: promptLoader.requiresProgrammingLanguage(targetSkill)
    };
  }

  addEvent(action, details = {}) {
    const event = this.createEvent(action, details);
    this.sessionMemory.push(event);
    
    logger.debug('Session event added', {
      action,
      eventId: event.id,
      totalEvents: this.sessionMemory.length
    });

    this.performMaintenanceIfNeeded();
    return event.id;
  }

  createEvent(action, details) {
    return {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      action,
      category: this.categorizeAction(action),
      primaryContent: this.extractPrimaryContent(action, details),
      metadata: this.extractMetadata(action, details),
      contextSummary: this.generateContextSummary(action, details)
    };
  }

  generateEventId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  categorizeAction(action) {
    const actionLower = (action || '').toLowerCase();
    
    if (actionLower.includes('screenshot') || actionLower.includes('ocr')) {
      return 'capture';
    }
    if (actionLower.includes('speech') || actionLower.includes('transcription')) {
      return 'speech';
    }
    if (actionLower.includes('llm') || actionLower.includes('gemini')) {
      return 'llm';
    }
    if (actionLower.includes('skill') || actionLower.includes('switch')) {
      return 'navigation';
    }
    
    return 'system';
  }

  extractPrimaryContent(action, details) {
    if (details.text && typeof details.text === 'string') {
      return details.text.substring(0, 200);
    }
    if (details.response && typeof details.response === 'string') {
      return details.response.substring(0, 200);
    }
    if (details.preview && typeof details.preview === 'string') {
      return details.preview;
    }
    
    return null;
  }

  extractMetadata(action, details) {
    const metadata = {};
    
    const metadataFields = ['skill', 'duration', 'size', 'textLength', 'processingTime'];
    metadataFields.forEach(field => {
      if (details[field] !== undefined) {
        metadata[field] = details[field];
      }
    });
    
    return Object.keys(metadata).length > 0 ? metadata : null;
  }

  generateContextSummary(action, details) {
    const role = details.role;
    const skill = details.skill || this.currentSkill;
    
    switch (action) {
      case 'speech_transcription':
        return `User spoke: "${details.content?.substring(0, 50)}..." (${skill} mode)`;
      case 'chat_input':
        return `User typed: "${details.content?.substring(0, 50)}..." (${skill} mode)`;
      case 'llm_response':
        return `AI responded in ${skill} mode (${details.responseLength || details.contentLength} chars)`;
      case 'ocr_extraction':
        return `Screenshot text extracted: ${details.textLength || details.contentLength} characters (${skill} mode)`;
      case 'skill_change':
        return `Switched from ${details.previousSkill} to ${details.newSkill} mode`;
      case 'skill_prompt_initialization':
        return `${skill} skill prompt loaded for context`;
      case 'user_message':
        return `User: "${details.content?.substring(0, 50)}..." (${skill})`;
      case 'model_response':
        return `Model: Response in ${skill} mode (${details.contentLength} chars)`;
      default:
        if (role === 'user') {
          return `User input in ${skill} mode`;
        } else if (role === 'model') {
          return `Model response in ${skill} mode`;
        }
        return action || 'Unknown action';
    }
  }

  performMaintenanceIfNeeded() {
    if (this.sessionMemory.length > this.maxSize) {
      this.performMaintenance();
    } else if (this.compressionEnabled && this.sessionMemory.length > this.compressionThreshold) {
      this.compressOldEvents();
    }
  }

  performMaintenance() {
    const beforeCount = this.sessionMemory.length;
    
    this.removeOldSystemEvents();
    this.consolidateSimilarEvents();
    
    const afterCount = this.sessionMemory.length;
    
    logger.info('Session memory maintenance completed', {
      beforeCount,
      afterCount,
      eventsRemoved: beforeCount - afterCount
    });
  }

  removeOldSystemEvents() {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    
    this.sessionMemory = this.sessionMemory.filter(event => {
      const eventTime = new Date(event.timestamp).getTime();
      const shouldKeep = event.category !== 'system' || eventTime > cutoffTime;
      return shouldKeep;
    });
  }

  consolidateSimilarEvents() {
    const groups = this.groupSimilarEvents();
    const consolidated = [];
    
    for (const group of groups) {
      if (group.length === 1) {
        consolidated.push(group[0]);
      } else {
        consolidated.push(this.createConsolidatedEvent(group));
      }
    }
    
    this.sessionMemory = consolidated;
  }

  groupSimilarEvents() {
    const groups = [];
    const processed = new Set();
    
    for (let i = 0; i < this.sessionMemory.length; i++) {
      if (processed.has(i)) continue;
      
      const group = [this.sessionMemory[i]];
      processed.add(i);
      
      for (let j = i + 1; j < this.sessionMemory.length; j++) {
        if (processed.has(j)) continue;
        
        if (this.areEventsSimilar(this.sessionMemory[i], this.sessionMemory[j])) {
          group.push(this.sessionMemory[j]);
          processed.add(j);
        }
      }
      
      groups.push(group);
    }
    
    return groups;
  }

  areEventsSimilar(event1, event2) {
    const timeDiff = Math.abs(
      new Date(event1.timestamp).getTime() - new Date(event2.timestamp).getTime()
    );
    
    return event1.category === event2.category && 
           event1.action === event2.action && 
           timeDiff < 60000; // Within 1 minute
  }

  createConsolidatedEvent(events) {
    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];
    
    return {
      ...firstEvent,
      id: this.generateEventId(),
      timestamp: lastEvent.timestamp,
      contextSummary: `${firstEvent.contextSummary} (${events.length} similar events)`,
      metadata: {
        ...firstEvent.metadata,
        consolidatedCount: events.length,
        timeSpan: {
          start: firstEvent.timestamp,
          end: lastEvent.timestamp
        }
      }
    };
  }

  compressOldEvents() {
    const cutoffTime = Date.now() - (2 * 60 * 60 * 1000); // 2 hours
    
    this.sessionMemory = this.sessionMemory.map(event => {
      const eventTime = new Date(event.timestamp).getTime();
      
      if (eventTime < cutoffTime && event.primaryContent && event.primaryContent.length > 100) {
        return {
          ...event,
          primaryContent: event.primaryContent.substring(0, 100) + '...[compressed]',
          compressed: true
        };
      }
      
      return event;
    });
  }

  getOptimizedHistory() {
    const recent = this.getRecentEvents(10);
    const important = this.getImportantEvents(5);
    const summary = this.generateSessionSummary();
    
    return {
      recent,
      important,
      summary,
      totalEvents: this.sessionMemory.length
    };
  }

  getRecentEvents(count = 10) {
    return this.sessionMemory
      .slice(-count)
      .map(event => ({
        timestamp: event.timestamp,
        action: event.action,
        category: event.category,
        summary: event.contextSummary,
        metadata: event.metadata
      }));
  }

  getImportantEvents(count = 5) {
    return this.sessionMemory
      .filter(event => ['capture', 'llm'].includes(event.category))
      .slice(-count)
      .map(event => ({
        timestamp: event.timestamp,
        category: event.category,
        summary: event.contextSummary,
        content: event.primaryContent?.substring(0, 150) || null
      }));
  }

  generateSessionSummary() {
    const categoryStats = this.getCategoryStatistics();
    const timeSpan = this.getSessionTimeSpan();
    const primaryActivities = this.getPrimaryActivities();
    
    return {
      duration: timeSpan,
      activities: categoryStats,
      focus: primaryActivities,
      eventCount: this.sessionMemory.length
    };
  }

  getCategoryStatistics() {
    const stats = {};
    
    this.sessionMemory.forEach(event => {
      stats[event.category] = (stats[event.category] || 0) + 1;
    });
    
    return stats;
  }

  getSessionTimeSpan() {
    if (this.sessionMemory.length === 0) return null;
    
    const timestamps = this.sessionMemory.map(e => new Date(e.timestamp).getTime());
    const start = Math.min(...timestamps);
    const end = Math.max(...timestamps);
    
    return {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      durationMs: end - start
    };
  }

  getPrimaryActivities() {
    const activities = {};
    
    this.sessionMemory.forEach(event => {
      if (event.metadata?.skill) {
        activities[event.metadata.skill] = (activities[event.metadata.skill] || 0) + 1;
      }
    });
    
    return Object.entries(activities)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([skill, count]) => ({ skill, count }));
  }

  clear() {
    const eventCount = this.sessionMemory.length;
    this.sessionMemory = [];
    this.isInitialized = false;
    
    logger.info('Session memory cleared', { eventCount });
    
    // Reinitialize with skill prompts
    this.initializeWithSkillPrompts();
  }

  getMemoryUsage() {
    const totalSize = JSON.stringify(this.sessionMemory).length;
    
    return {
      eventCount: this.sessionMemory.length,
      approximateSize: `${(totalSize / 1024).toFixed(2)} KB`,
      utilizationPercent: Math.round((this.sessionMemory.length / this.maxSize) * 100)
    };
  }
}

module.exports = new SessionManager();