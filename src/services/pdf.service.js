const fs = require('fs');
const mammoth = require('mammoth');

// Try to load pdf-parse but handle it gracefully if it fails
let pdfParse;
let pdfParseAvailable = false;
try {
  pdfParse = require('pdf-parse');
  pdfParseAvailable = true;
} catch (error) {
  console.warn('pdf-parse not available:', error.message);
}

// Configure pdf-parse for Node.js environment with proper worker setup
const pdfParseOptions = {
  // Ensure it works in Node.js without DOM
  normalizeWhitespace: false,
  disableCombineTextItems: false,
  // Disable worker to avoid PDFJS.workerSrc issues in Node.js
  useWorker: false,
  // Provide custom render functions to avoid DOM dependencies
  render_page: function(pageData) {
    // Custom render function for Node.js
    let text = '';
    if (pageData && pageData.getTextContent) {
      return pageData.getTextContent().then(function(textContent) {
        if (textContent && textContent.items) {
          return textContent.items.map(item => item.str).join(' ');
        }
        return '';
      });
    }
    return Promise.resolve('');
  }
};

// Set up pdf-parse environment for Node.js
if (typeof global !== 'undefined') {
  // Provide global references that pdf-parse expects
  if (!global.window) {
    global.window = {};
  }
  if (!global.document) {
    global.document = {};
  }
  if (!global.HTMLElement) {
    global.HTMLElement = class HTMLElement {};
  }
  // Mock PDFJS to prevent worker errors
  if (!global.PDFJS) {
    global.PDFJS = {
      workerSrc: '',
      disableWorker: true
    };
  }
}

const logger = require('../core/logger').createServiceLogger('DOCUMENT');

class DocumentService {
  constructor() {
    this.initialized = true;
    this.setupPDFEnvironment();
    logger.info('Document service initialized successfully (PDF + Word)');
  }

  setupPDFEnvironment() {
    // Ensure all required globals are set up for pdf-parse
    if (typeof global !== 'undefined') {
      // Mock window object
      if (!global.window) {
        global.window = {
          location: { href: '' },
          navigator: { userAgent: 'Node.js' },
          addEventListener: () => {},
          removeEventListener: () => {},
          setTimeout: setTimeout,
          clearTimeout: clearTimeout,
          btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
          atob: (str) => Buffer.from(str, 'base64').toString('binary')
        };
      }
      
      // Mock document object with comprehensive DOM elements
      if (!global.document) {
        global.document = {
          createElement: (tagName) => ({
            tagName: tagName.toUpperCase(),
            style: {},
            setAttribute: () => {},
            getAttribute: () => null,
            appendChild: () => {},
            removeChild: () => {},
            addEventListener: () => {},
            removeEventListener: () => {}
          }),
          documentElement: { style: {} },
          head: { appendChild: () => {} },
          body: { appendChild: () => {} }
        };
      }
      
      // Mock all DOM elements that might be referenced
      const DOMElements = ['HTMLElement', 'Element', 'Node', 'HTMLCanvasElement', 'HTMLImageElement'];
      DOMElements.forEach(elementName => {
        if (!global[elementName]) {
          global[elementName] = class extends Object {
            constructor() {
              super();
              this.style = {};
              this.classList = {
                add: () => {},
                remove: () => {},
                contains: () => false
              };
            }
            setAttribute() {}
            getAttribute() { return null; }
            appendChild() {}
            removeChild() {}
            addEventListener() {}
            removeEventListener() {}
          };
        }
      });
      
      // Mock XMLHttpRequest
      if (!global.XMLHttpRequest) {
        global.XMLHttpRequest = class XMLHttpRequest {
          open() {}
          send() {}
          setRequestHeader() {}
        };
      }
      
      // Mock history object to prevent "history is not defined" error
      if (!global.history) {
        global.history = {
          pushState: () => {},
          replaceState: () => {},
          back: () => {},
          forward: () => {},
          go: () => {}
        };
      }
      
      // Mock console if not available
      if (!global.console) {
        global.console = console;
      }
      
      // Mock PDFJS configuration with comprehensive setup
      if (!global.PDFJS) {
        global.PDFJS = {
          workerSrc: '',
          disableWorker: true,
          isEvalSupported: false,
          GlobalWorkerOptions: {
            workerSrc: ''
          }
        };
      }
      
      // Mock additional globals that PDF.js might reference
      if (!global.URL) {
        global.URL = {
          createObjectURL: () => 'blob:mock',
          revokeObjectURL: () => {}
        };
      }
      
      if (!global.FileReader) {
        global.FileReader = class FileReader {
          readAsArrayBuffer() {}
          readAsDataURL() {}
        };
      }
    }
  }

  async extractTextFromPDF(filePath) {
    try {
      logger.info('Starting PDF text extraction', { filePath });

      // Read the PDF file as buffer and delegate to buffer method
      const pdfBuffer = fs.readFileSync(filePath);
      return await this.extractTextFromBuffer(pdfBuffer);

    } catch (error) {
      logger.error('Failed to extract text from PDF', { 
        error: error.message,
        filePath 
      });

      return {
        success: false,
        error: error.message,
        text: null
      };
    }
  }

  async extractTextFromBuffer(pdfBuffer) {
    try {
      logger.info('Starting PDF text extraction from buffer');

      // Check if pdf-parse is available
      if (!pdfParseAvailable || !pdfParse) {
        throw new Error('PDF parsing library not available');
      }

      // Set up environment before any parsing attempts
      this.setupPDFEnvironment();
      
      // Force disable worker globally before any parsing
      if (global.PDFJS) {
        global.PDFJS.GlobalWorkerOptions = { workerSrc: '' };
        global.PDFJS.disableWorker = true;
      }

      // Try multiple approaches for PDF parsing with aggressive error handling
      let data;
      const parseAttempts = [
        // Attempt 1: Absolute minimal configuration
        async () => {
          return await pdfParse(pdfBuffer, {});
        },
        // Attempt 2: With explicit worker disable
        async () => {
          return await pdfParse(pdfBuffer, { useWorker: false });
        },
        // Attempt 3: With custom render function
        async () => {
          return await pdfParse(pdfBuffer, {
            useWorker: false,
            render_page: (pageData) => {
              if (pageData && pageData.getTextContent) {
                return pageData.getTextContent().then(textContent => {
                  if (textContent && textContent.items) {
                    return textContent.items.map(item => item.str || '').join(' ');
                  }
                  return '';
                });
              }
              return Promise.resolve('');
            }
          });
        }
      ];

      let lastError;
      for (let i = 0; i < parseAttempts.length; i++) {
        try {
          logger.info(`Attempting PDF parse method ${i + 1}`);
          
          // Add timeout to prevent hanging
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('PDF parsing timeout')), 30000) // 30 second timeout
          );
          
          data = await Promise.race([parseAttempts[i](), timeoutPromise]);
          logger.info(`PDF parse method ${i + 1} succeeded`);
          break;
        } catch (attemptError) {
          lastError = attemptError;
          logger.warn(`PDF parse attempt ${i + 1} failed`, { 
            error: attemptError.message 
          });
        }
      }

      if (!data) {
        logger.error('All PDF parse attempts failed', { 
          finalError: lastError?.message 
        });
        
        // Final fallback: try to get basic PDF info without full text parsing
        try {
          logger.info('Attempting basic PDF info extraction as fallback');
          const basicInfo = this.extractBasicPDFInfo(pdfBuffer);
          
          return {
            success: false,
            error: 'Text extraction failed but PDF appears valid',
            text: '',
            metadata: {
              pages: basicInfo.estimatedPages,
              info: basicInfo,
              textLength: 0,
              isImageBased: true
            },
            fallbackInfo: `This PDF appears to be image-based or has complex formatting. File size: ${Math.round(pdfBuffer.length / 1024)}KB. Consider converting to images for analysis.`
          };
        } catch (fallbackError) {
          logger.error('Even basic PDF info extraction failed', { 
            error: fallbackError.message 
          });
        }
        
        throw new Error(`PDF parsing failed: ${lastError?.message || 'Unknown error'}`);
      }
      
      const extractedText = data.text;
      const metadata = {
        pages: data.numpages,
        info: data.info,
        textLength: extractedText.length
      };

      logger.info('PDF text extracted successfully from buffer', {
        pages: metadata.pages,
        textLength: metadata.textLength
      });

      return {
        success: true,
        text: extractedText,
        metadata: metadata
      };

    } catch (error) {
      logger.error('Failed to extract text from PDF buffer', { 
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        text: null
      };
    }
  }

  async extractTextFromWord(filePath) {
    try {
      logger.info('Starting Word document text extraction', { filePath });

      // Read and parse the Word document
      const result = await mammoth.extractRawText({ path: filePath });
      
      const extractedText = result.value;
      const metadata = {
        textLength: extractedText.length,
        messages: result.messages || []
      };

      logger.info('Word document text extracted successfully', {
        textLength: metadata.textLength,
        warningCount: metadata.messages.length
      });

      return {
        success: true,
        text: extractedText,
        metadata: metadata
      };

    } catch (error) {
      logger.error('Failed to extract text from Word document', { 
        error: error.message,
        filePath 
      });

      return {
        success: false,
        error: error.message,
        text: null
      };
    }
  }

  async extractTextFromWordBuffer(buffer) {
    try {
      logger.info('Starting Word document text extraction from buffer');

      // Parse the Word document buffer
      const result = await mammoth.extractRawText({ buffer: buffer });
      
      const extractedText = result.value;
      const metadata = {
        textLength: extractedText.length,
        messages: result.messages || []
      };

      logger.info('Word document text extracted successfully from buffer', {
        textLength: metadata.textLength,
        warningCount: metadata.messages.length
      });

      return {
        success: true,
        text: extractedText,
        metadata: metadata
      };

    } catch (error) {
      logger.error('Failed to extract text from Word document buffer', { 
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        text: null
      };
    }
  }

  formatPDFContent(text, metadata) {
    const formattedContent = `📄 **PDF Document Analysis**

**Document Information:**
- Pages: ${metadata.pages}
- Text Length: ${metadata.textLength.toLocaleString()} characters
${metadata.info?.Title ? `- Title: ${metadata.info.Title}` : ''}
${metadata.info?.Author ? `- Author: ${metadata.info.Author}` : ''}

**Content:**

${text.trim()}`;

    return formattedContent;
  }

  formatWordContent(text, metadata) {
    const formattedContent = `📝 **Word Document Analysis**

**Document Information:**
- Text Length: ${metadata.textLength.toLocaleString()} characters
${metadata.messages.length > 0 ? `- Processing Warnings: ${metadata.messages.length}` : ''}

**Content:**

${text.trim()}`;

    return formattedContent;
  }

  isTextMeaningful(text) {
    // Check if the extracted text is meaningful (not just whitespace or garbled)
    const meaningfulText = text.trim();
    
    if (meaningfulText.length < 10) {
      return false;
    }

    // Check for reasonable text-to-whitespace ratio
    const nonWhitespaceChars = meaningfulText.replace(/\s/g, '').length;
    const ratio = nonWhitespaceChars / meaningfulText.length;
    
    return ratio > 0.3; // At least 30% should be non-whitespace
  }

  extractBasicPDFInfo(pdfBuffer) {
    try {
      // Basic PDF analysis without full parsing
      const bufferString = pdfBuffer.toString('latin1');
      
      // Look for PDF version
      let version = 'Unknown';
      const versionMatch = bufferString.match(/%PDF-(\d\.\d)/);
      if (versionMatch) {
        version = versionMatch[1];
      }

      // Estimate page count by counting /Type /Page occurrences
      let estimatedPages = 1;
      const pageMatches = bufferString.match(/\/Type\s*\/Page[^s]/g);
      if (pageMatches) {
        estimatedPages = pageMatches.length;
      }

      // Look for basic metadata
      let title = null;
      const titleMatch = bufferString.match(/\/Title\s*\(([^)]+)\)/);
      if (titleMatch) {
        title = titleMatch[1];
      }

      return {
        version,
        estimatedPages,
        Title: title,
        fileSize: pdfBuffer.length,
        hasImages: bufferString.includes('/Subtype/Image'),
        hasText: bufferString.includes('/Font') || bufferString.includes('TJ') || bufferString.includes('Tj')
      };
    } catch (error) {
      logger.warn('Basic PDF info extraction failed', { error: error.message });
      return {
        version: 'Unknown',
        estimatedPages: 1,
        Title: null,
        fileSize: pdfBuffer.length,
        hasImages: false,
        hasText: false
      };
    }
  }
}

// Export singleton instance
module.exports = new DocumentService();