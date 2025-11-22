#!/bin/bash

# Dynamic Pricing AI Backend - Quick Start Script
# This script helps you set up and run the backend server

echo "🌾 Daily N'Oats - Dynamic Pricing AI Backend Setup"
echo "=================================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found!"
    echo "Please run this script from the backend directory"
    exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating from template..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ Created .env file"
        echo ""
        echo "📝 IMPORTANT: Edit .env file with your API keys before continuing!"
        echo "   nano .env"
        echo ""
        read -p "Press Enter after you've added your API keys..."
    else
        echo "❌ Error: .env.example not found!"
        exit 1
    fi
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ npm install failed!"
        exit 1
    fi
    echo "✅ Dependencies installed"
fi

echo ""
echo "🚀 Starting Dynamic Pricing AI Backend..."
echo "   Server will run on http://localhost:3001"
echo "   Press Ctrl+C to stop"
echo ""

# Start the server
npm start
