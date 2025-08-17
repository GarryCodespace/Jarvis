const https = require('https');
const logger = require('../core/logger').createServiceLogger('OpenAI');
const config = require('../core/config');
const { promptLoader } = require('../../prompt-loader');

class OpenAIService {
  constructor() {
    this.isInitialized = false;
    this.requestCount = 0;
    this.errorCount = 0;
    this.apiKey = null;
    
    this.initializeClient();
  }

  initializeClient() {
    // Use the provided OpenAI API key
    this.apiKey = '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';
    
    if (!this.apiKey) {
      logger.warn('OpenAI API key not configured');
      return;
    }

    this.isInitialized = true;
    logger.info('OpenAI client initialized successfully');
  }

  async processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error('OpenAI service not initialized. Check API key configuration.');
    }

    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
      throw new Error('Invalid image buffer provided to processImageWithSkill');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      // Convert image to base64
      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64Image}`;

      // Build system prompt
      const skillPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';
      const imageInstruction = this.formatImageInstruction(activeSkill, programmingLanguage);

      const messages = [
        {
          role: 'system',
          content: skillPrompt || `You are JARVIX, Tony Stark's AI assistant with advanced image analysis capabilities. You are intelligent, helpful, sophisticated, and have a slight British accent in your responses. You can see and analyze images, screenshots, and visual content. When provided with an image, analyze it carefully for ${activeSkill.toUpperCase()} questions and provide detailed insights based on what you observe in the image.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: imageInstruction
            },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl,
                detail: 'auto'
              }
            }
          ]
        }
      ];

      const response = await this.makeOpenAIRequest(messages, 'gpt-4-turbo');
      
      // Enforce language in code fences if provided
      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(response, programmingLanguage)
        : response;

      logger.logPerformance('OpenAI image processing', startTime, {
        activeSkill,
        imageSize: imageBuffer.length,
        responseLength: finalResponse.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isImageAnalysis: true,
          mimeType
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('OpenAI image processing failed', {
        error: error.message,
        activeSkill,
        requestId: this.requestCount
      });

      // Return the actual API error message instead of a generic fallback
      return {
        response: `Image analysis failed: ${error.message}. Please try again or check your image format.`,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: true,
          isImageAnalysis: true,
          mimeType,
          error: error.message
        }
      };
    }
  }

  formatImageInstruction(activeSkill, programmingLanguage) {
    const langNote = programmingLanguage ? ` Use only ${programmingLanguage.toUpperCase()} for any code.` : '';
    return `Please analyze the image I've uploaded. Look at what's shown in the image and help me with this ${activeSkill.toUpperCase()} question. Describe what you see and provide a complete solution with explanation and code if applicable.${langNote}`;
  }

  async processTextWithSkill(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error('OpenAI service not initialized. Check API key configuration.');
    }

    const startTime = Date.now();
    this.requestCount++;
    
    try {
      logger.info('Processing text with OpenAI', {
        activeSkill,
        textLength: text.length,
        hasSessionMemory: sessionMemory.length > 0,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      const messages = this.buildOpenAIMessages(text, activeSkill, sessionMemory, programmingLanguage);
      const response = await this.makeOpenAIRequest(messages);
      
      // Enforce language in code fences if programmingLanguage specified
      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(response, programmingLanguage)
        : response;

      logger.logPerformance('OpenAI text processing', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: finalResponse.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('OpenAI processing failed', {
        error: error.message,
        activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      // Return the actual API error message instead of a generic fallback
      return {
        response: `Processing failed: ${error.message}. Please try again.`,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: true,
          error: error.message
        }
      };
    }
  }

  async processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error('OpenAI service not initialized. Check API key configuration.');
    }

    const startTime = Date.now();
    this.requestCount++;
    
    try {
      logger.info('Processing transcription with intelligent response', {
        activeSkill,
        textLength: text.length,
        hasSessionMemory: sessionMemory.length > 0,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      const messages = this.buildIntelligentTranscriptionMessages(text, activeSkill, sessionMemory, programmingLanguage);
      const response = await this.makeOpenAIRequest(messages);
      
      // Enforce language in code fences if programmingLanguage specified
      const finalResponse = programmingLanguage
        ? this.enforceProgrammingLanguage(response, programmingLanguage)
        : response;

      logger.logPerformance('OpenAI transcription processing', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: finalResponse.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      return {
        response: finalResponse,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isTranscriptionResponse: true
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('OpenAI transcription processing failed', {
        error: error.message,
        activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      // Return the actual API error message instead of a generic fallback
      return {
        response: `Transcription processing failed: ${error.message}. Please try again.`,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: true,
          isTranscriptionResponse: true,
          error: error.message
        }
      };
    }
  }

  buildOpenAIMessages(text, activeSkill, sessionMemory, programmingLanguage) {
    const skillPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || 
      `You are JARVIX, Tony Stark's AI assistant. You are intelligent, helpful, sophisticated, and have a slight British accent in your responses. Focus on ${activeSkill.toUpperCase()} questions.`;

    const messages = [
      {
        role: 'system',
        content: skillPrompt
      }
    ];

    // Add session memory as context
    if (sessionMemory && sessionMemory.length > 0) {
      sessionMemory.slice(-10).forEach(memory => {
        if (memory.role && memory.content) {
          messages.push({
            role: memory.role === 'model' ? 'assistant' : memory.role,
            content: memory.content
          });
        }
      });
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: this.formatUserMessage(text, activeSkill)
    });

    return messages;
  }

  buildIntelligentTranscriptionMessages(text, activeSkill, sessionMemory, programmingLanguage) {
    const intelligentPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage);
    
    const messages = [
      {
        role: 'system',
        content: intelligentPrompt
      }
    ];

    // Add recent session memory
    if (sessionMemory && sessionMemory.length > 0) {
      sessionMemory.slice(-8).forEach(memory => {
        if (memory.role && memory.content && memory.role !== 'system') {
          messages.push({
            role: memory.role === 'model' ? 'assistant' : memory.role,
            content: memory.content
          });
        }
      });
    }

    // Add current transcription
    messages.push({
      role: 'user',
      content: text.trim()
    });

    return messages;
  }

  getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage) {
    let prompt = `# JARVIX - Intelligent Transcription Response System

You are JARVIX, Tony Stark's AI assistant. You are intelligent, helpful, sophisticated, and have a slight British accent in your responses.

Assume you are asked a question in ${activeSkill.toUpperCase()} mode. Your job is to intelligently respond to questions/messages with appropriate brevity.
Assume you are in an interview and you need to perform best in ${activeSkill.toUpperCase()} mode.
Always respond to the point, do not repeat the question or unnecessary information which is not related to ${activeSkill}.`;

    // Add programming language context if provided
    if (programmingLanguage) {
      const lang = String(programmingLanguage).toLowerCase();
      const languageMap = { cpp: 'C++', c: 'C', python: 'Python', java: 'Java', javascript: 'JavaScript', js: 'JavaScript' };
      const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      const languageTitle = languageMap[lang] || (lang.charAt(0).toUpperCase() + lang.slice(1));
      const fenceTag = fenceTagMap[lang] || lang || 'text';
      prompt += `\n\nCODING CONTEXT: Respond ONLY in ${languageTitle}. All code blocks must use triple backticks with language tag \`\`\`${fenceTag}\`\`\`. Do not include other languages unless explicitly asked.`;
    }

    prompt += `

## Response Rules:

### If the transcription is casual conversation, greetings, or NOT related to ${activeSkill}:
- Respond with: "Indeed, sir. I'm listening. What ${activeSkill} question can I assist you with?"
- Or similar brief acknowledgments like: "At your service, sir. What's your ${activeSkill} inquiry?"

### If the transcription IS relevant to ${activeSkill} or is a follow-up question:
- Provide a comprehensive, detailed response
- Use bullet points, examples, and explanations
- Focus on actionable insights and complete answers
- Do not truncate or shorten your response

### Examples of casual/irrelevant messages:
- "Hello", "Hi there", "How are you?"
- "What's the weather like?"
- "I'm just testing this"
- Random conversations not related to ${activeSkill}

### Examples of relevant messages:
- Actual questions about ${activeSkill} concepts
- Follow-up questions to previous responses
- Requests for clarification on ${activeSkill} topics
- Problem-solving requests related to ${activeSkill}

## Response Format:
- Keep responses detailed and sophisticated
- Use bullet points for structured answers
- Be encouraging and helpful with a slight British accent
- Stay focused on ${activeSkill}
- Always address the user as "sir" when appropriate

If the user's input is a coding or DSA problem statement and contains no code, produce a complete, runnable solution in the selected programming language without asking for more details. Always include the final implementation in a properly tagged code block.

Remember: Be intelligent about filtering - only provide detailed responses when the user actually needs help with ${activeSkill}.`;

    return prompt;
  }

  formatUserMessage(text, activeSkill) {
    return `Context: ${activeSkill.toUpperCase()} analysis request\n\nText to analyze:\n${text}`;
  }

  async makeOpenAIRequest(messages, model = 'gpt-4-turbo') {
    const postData = JSON.stringify({
      model: model,
      messages: messages,
      max_tokens: 2048,
      temperature: 0.7
    });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (res.statusCode !== 200) {
              reject(new Error(`OpenAI API error: ${response.error?.message || 'Unknown error'}`));
              return;
            }

            if (response.choices && response.choices[0] && response.choices[0].message) {
              resolve(response.choices[0].message.content);
            } else {
              reject(new Error('Invalid response format from OpenAI API'));
            }
          } catch (error) {
            reject(new Error('Failed to parse OpenAI API response: ' + error.message));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  enforceProgrammingLanguage(text, programmingLanguage) {
    try {
      if (!text || !programmingLanguage) return text;
      const norm = String(programmingLanguage).toLowerCase();
      const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      const fenceTag = fenceTagMap[norm] || norm || 'text';

      // Replace all triple-backtick fences' language token with the selected tag
      const replacedBackticks = text.replace(/```([^\n]*)\n/g, (match, info) => {
        const current = (info || '').trim();
        // If already the desired fenceTag as the first token, keep as is
        if (current.split(/\s+/)[0].toLowerCase() === fenceTag) return match;
        return '```' + fenceTag + '\n';
      });

      return replacedBackticks;
    } catch (_) {
      return text;
    }
  }

  generateFallbackResponse(text, activeSkill) {
    logger.info('Generating fallback response', { activeSkill });

    const fallbackResponses = {
      'dsa': 'This appears to be a data structures and algorithms problem. Consider breaking it down into smaller components and identifying the appropriate algorithm or data structure to use.',
      'system-design': 'For this system design question, consider scalability, reliability, and the trade-offs between different architectural approaches.',
      'programming': 'This looks like a programming challenge. Focus on understanding the requirements, edge cases, and optimal time/space complexity.',
      'default': 'I can help analyze this content. Please ensure your OpenAI API key is properly configured for detailed analysis.'
    };

    const response = fallbackResponses[activeSkill] || fallbackResponses.default;
    
    return {
      response,
      metadata: {
        skill: activeSkill,
        processingTime: 0,
        requestId: this.requestCount,
        usedFallback: true
      }
    };
  }

  generateIntelligentFallbackResponse(text, activeSkill) {
    logger.info('Generating intelligent fallback response for transcription', { activeSkill });

    // Simple heuristic to determine if message seems skill-related
    const skillKeywords = {
      'dsa': ['algorithm', 'data structure', 'array', 'tree', 'graph', 'sort', 'search', 'complexity', 'big o'],
      'programming': ['code', 'function', 'variable', 'class', 'method', 'bug', 'debug', 'syntax'],
      'system-design': ['scalability', 'database', 'architecture', 'microservice', 'load balancer', 'cache']
    };

    const textLower = text.toLowerCase();
    const relevantKeywords = skillKeywords[activeSkill] || [];
    const hasRelevantKeywords = relevantKeywords.some(keyword => textLower.includes(keyword));
    
    // Check for question indicators
    const questionIndicators = ['how', 'what', 'why', 'when', 'where', 'can you', 'could you', 'should i', '?'];
    const seemsLikeQuestion = questionIndicators.some(indicator => textLower.includes(indicator));

    let response;
    if (hasRelevantKeywords || seemsLikeQuestion) {
      response = `I'm having trouble processing that right now, sir, but it sounds like a ${activeSkill} question. Could you rephrase or ask more specifically about what you need help with?`;
    } else {
      response = `Indeed, sir. I'm listening. What ${activeSkill} question can I assist you with?`;
    }
    
    return {
      response,
      metadata: {
        skill: activeSkill,
        processingTime: 0,
        requestId: this.requestCount,
        usedFallback: true,
        isTranscriptionResponse: true
      }
    };
  }

  async testConnection() {
    if (!this.isInitialized) {
      return { success: false, error: 'Service not initialized' };
    }

    try {
      const testMessages = [
        {
          role: 'system',
          content: 'You are JARVIX, Tony Stark\'s AI assistant.'
        },
        {
          role: 'user',
          content: 'Test connection. Please respond with "At your service, sir."'
        }
      ];

      const startTime = Date.now();
      const response = await this.makeOpenAIRequest(testMessages);
      const latency = Date.now() - startTime;
      
      logger.info('Connection test successful', { 
        response, 
        latency
      });
      
      return { 
        success: true, 
        response: response.trim(),
        latency
      };
    } catch (error) {
      logger.error('Connection test failed', { 
        error: error.message
      });
      
      return { 
        success: false, 
        error: error.message
      };
    }
  }

  updateApiKey(newApiKey) {
    this.apiKey = newApiKey;
    this.isInitialized = !!newApiKey;
    logger.info('API key updated and client reinitialized');
  }

  getStats() {
    return {
      isInitialized: this.isInitialized,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 0
    };
  }

  // Additional methods for compatibility
  generateContentDirect(prompt) {
    const messages = [
      {
        role: 'system',
        content: 'You are JARVIX, Tony Stark\'s AI assistant.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];
    return this.makeOpenAIRequest(messages);
  }

  // Properties for compatibility
  get client() {
    return this.isInitialized ? { initialized: true } : null;
  }

  get model() {
    return this.isInitialized ? { generateContent: this.generateContentDirect.bind(this) } : null;
  }
}

module.exports = new OpenAIService();