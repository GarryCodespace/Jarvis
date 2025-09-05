# J.A.R.V.I.X - AI Problem Solving Assistant

<div align="center">
  <img src="./assests/icons/jarvis.png" alt="JARVIX Logo" width="128" height="128">
  
  **Your intelligent AI assistant for problem-solving, productivity, and creativity**
  
  ![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
  ![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)
  ![License](https://img.shields.io/badge/license-ISC-green.svg)
</div>

## ✨ Features

- 🤖 **Advanced AI Assistant** - Powered by Google Gemini and OpenAI
- 🖼️ **Image Processing** - Analyze, edit, and understand images
- 🎙️ **Voice Recognition** - Natural speech-to-text interaction
- 📁 **File Attachments** - Drag & drop or paste files directly
- ⚡ **Lightning Fast** - Optimized Electron app with minimal footprint
- 🎨 **Beautiful UI** - Modern design with animated JARVIX branding
- 🔒 **Privacy First** - No authentication required, works offline-capable

## 🖥️ Screenshots

*[Screenshots would be added here]*

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Electron 29+

### Installation

```bash
# Clone the repository
git clone https://github.com/TechyCSR/JARVIX.git
cd JARVIX

# Install dependencies
npm install

# Start the application
npm start
```

### Environment Setup

Create a `.env` file in the root directory:

```env
# AI Services (Optional - has fallbacks)
GOOGLE_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Azure Speech (Optional)
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=your_azure_region

# Payment Integration (Optional - disabled by default)
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_MONTHLY_PRICE_ID=your_stripe_price_id

# Supabase (Optional - for user management)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 📦 Building for Distribution

```bash
# Clean previous builds
npm run clean

# Build for specific platforms
npm run build:mac     # macOS (Intel + Apple Silicon)
npm run build:win     # Windows
npm run build:linux   # Linux (AppImage, DEB, RPM)

# Build for all platforms
npm run build:all
```

## 🏗️ Project Structure

```
JARVIX/
├── main.js                 # Main Electron process
├── preload.js              # Preload script for IPC
├── chat-gpt.html           # Main UI
├── package.json            # Dependencies & build config
├── src/
│   ├── core/               # Core utilities
│   ├── managers/           # Window & session managers
│   ├── services/           # AI, speech, payment services
│   └── ui/                 # UI components
├── assests/                # Icons and resources
└── website/                # Download page
```

## 🔧 Configuration

JARVIX supports multiple AI providers and can work with minimal configuration:

### AI Providers
- **Google Gemini** (Primary) - Best performance
- **OpenAI GPT** (Fallback) - Reliable alternative
- **Local/Offline** (Future) - Privacy-focused option

### Features Toggle
- Authentication: Disabled by default
- Payment system: Commented out for free usage
- Voice recognition: Optional Azure Speech integration
- Image processing: Works with or without premium features

## 🖥️ System Requirements

### macOS
- macOS 10.15 (Catalina) or later
- 4 GB RAM minimum, 8 GB recommended
- 500 MB free disk space

### Windows  
- Windows 10 or Windows 11
- 4 GB RAM minimum, 8 GB recommended
- 500 MB free disk space

### Linux
- Ubuntu 18.04+ or equivalent
- 4 GB RAM minimum, 8 GB recommended  
- 500 MB free disk space

## 🛠️ Development

### Available Scripts

```bash
npm start          # Start in development mode
npm run dev        # Start with debugging flags
npm run build      # Build for production
npm run test       # Run tests (if available)
npm run clean      # Clean build directory
```

### Key Components

1. **Main Process** (`main.js`) - Handles app lifecycle, windows, IPC
2. **Renderer Process** (`chat-gpt.html` + `src/ui/`) - User interface
3. **Services** (`src/services/`) - AI integration, speech, payments
4. **Managers** (`src/managers/`) - Window and session management

## 🎨 Customization

### Themes
- Modify CSS in `chat-gpt.html` for UI theming
- JARVIX uses cyan (#00ffff) as primary color
- Dark theme optimized for readability

### AI Configuration
- Switch between AI providers in `src/services/`
- Add new providers by implementing the service interface
- Configure temperature, model settings in service files

## 📱 Usage

1. **Start JARVIX** - Launch the app, no sign-in required
2. **Ask Questions** - Type naturally or use voice commands
3. **Attach Files** - Drag & drop images, documents, code files
4. **Copy Responses** - Click copy button on any AI response
5. **Voice Input** - Use speech recognition for hands-free interaction

## 🔒 Privacy & Security

- **No Telemetry** - JARVIX doesn't track user behavior
- **Local Storage** - Session data stored locally only
- **Optional Authentication** - Can be enabled if needed
- **API Keys** - Stored locally in environment variables
- **Open Source** - Full code transparency

## 🤝 Contributing

We welcome contributions! Please read our contributing guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Development Setup

```bash
git clone https://github.com/TechyCSR/JARVIX.git
cd JARVIX
npm install
npm start
```

## 📄 License

ISC License - see [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**@TechyCSR**
- Email: dev@techycsr.me
- GitHub: [TechyCSR](https://github.com/TechyCSR)

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/TechyCSR/OpenCluely/issues)
- **Documentation**: See `/docs` folder
- **Community**: [Discussions](https://github.com/TechyCSR/OpenCluely/discussions)

## 🚀 Deployment on Lovable

JARVIX is ready for deployment on Lovable! The codebase includes:

- ✅ Clean, well-structured Electron app
- ✅ No authentication barriers (works immediately)  
- ✅ Professional UI with JARVIX branding
- ✅ Multiple AI provider support
- ✅ Cross-platform compatibility
- ✅ Built-in download page
- ✅ Proper quit/exit handling

### For Lovable Deployment:
1. Upload the entire codebase
2. Set up environment variables (optional)
3. Run `npm install && npm start` 
4. Users can download built versions or run from source

---

<div align="center">
  <strong>Built with ❤️ for the AI community</strong>
</div>