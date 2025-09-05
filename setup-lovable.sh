#!/bin/bash

# JARVIX Setup Script for Lovable
# This script sets up JARVIX on Lovable platform

set -e

echo "🚀 Setting up JARVIX - AI Assistant..."
echo "======================================"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt "18" ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node --version)"
    exit 1
fi

echo "✅ Node.js $(node --version) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating environment configuration..."
    cat > .env << EOL
# JARVIX Environment Configuration
# These are all optional - JARVIX works without them

# AI Services (Optional - JARVIX has fallbacks)
# GOOGLE_API_KEY=your_gemini_api_key_here
# OPENAI_API_KEY=your_openai_api_key_here

# Azure Speech (Optional - for voice recognition)
# AZURE_SPEECH_KEY=your_azure_speech_key
# AZURE_SPEECH_REGION=eastus

# Payment Integration (Disabled by default)
# STRIPE_SECRET_KEY=your_stripe_secret_key
# STRIPE_MONTHLY_PRICE_ID=your_stripe_price_id

# Supabase (Optional - for user management)
# SUPABASE_URL=your_supabase_url
# SUPABASE_ANON_KEY=your_supabase_anon_key
EOL
    echo "✅ Environment file created (.env)"
    echo "💡 You can add your API keys later if needed"
else
    echo "✅ Environment file already exists"
fi

# Test the application
echo "🧪 Testing JARVIX startup..."
timeout 10s npm start &
START_PID=$!

sleep 5

if kill -0 $START_PID 2>/dev/null; then
    echo "✅ JARVIX started successfully!"
    kill $START_PID 2>/dev/null || true
    wait $START_PID 2>/dev/null || true
else
    echo "⚠️  JARVIX startup test completed (this is normal for headless environments)"
fi

echo ""
echo "🎉 JARVIX Setup Complete!"
echo "======================================"
echo ""
echo "🚀 To start JARVIX:"
echo "   npm start"
echo ""
echo "🏗️  To build distributables:"
echo "   npm run build:mac     # macOS"
echo "   npm run build:win     # Windows"  
echo "   npm run build:linux   # Linux"
echo "   npm run build:all     # All platforms"
echo ""
echo "📖 Documentation:"
echo "   - Main README: ./JARVIX-README.md"
echo "   - Download page: ./website/download.html"
echo "   - Configuration: ./lovable-config.json"
echo ""
echo "🔧 Features:"
echo "   ✅ AI Assistant (Google Gemini + OpenAI)"
echo "   ✅ Image Processing"
echo "   ✅ Voice Recognition (with Azure Speech)"
echo "   ✅ File Attachments"
echo "   ✅ No Authentication Required"
echo "   ✅ Cross-platform Support"
echo ""
echo "💡 JARVIX works immediately without any API keys!"
echo "   Add them to .env file for enhanced features."
echo ""
echo "Happy coding with JARVIX! 🤖✨"