#!/bin/bash

# SuiLens Docker Startup Script
# This script helps you start the entire SuiLens application with Docker

set -e

echo "🔍 Starting SuiLens..."
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed"
    echo "Please install Docker from: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is available
if ! docker compose version &> /dev/null; then
    echo "❌ Error: Docker Compose is not available"
    echo "Please install Docker Compose v2"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Check if .env file exists, if not, inform user (optional)
if [ ! -f .env ]; then
    echo "ℹ️  No .env file found - using default values from docker-compose.yml"
    echo "   This is fine for development!"
    echo ""
fi

# Stop any running containers
echo "🛑 Stopping any existing containers..."
docker compose down

echo ""
echo "🏗️  Building and starting all services..."
echo "   - PostgreSQL database"
echo "   - Redis queue"
echo "   - Backend API server"
echo "   - Frontend web app"
echo ""

# Start all services
docker compose up --build

# If the script exits (user stops docker compose), show message
echo ""
echo "👋 SuiLens stopped. Run './docker-start.sh' to start again."

