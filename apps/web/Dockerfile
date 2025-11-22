# Frontend Dockerfile with Vite hot reload support
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy root package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all workspace packages for dependency resolution
COPY packages ./packages
COPY apps/web ./apps/web

# Install all dependencies (including devDependencies for Vite)
RUN pnpm install --frozen-lockfile

# Build the shared core package
RUN pnpm --filter @suilens/core build

# Expose Vite dev server port
EXPOSE 3000

# Set working directory back to app root for pnpm workspace context
WORKDIR /app

# Start Vite dev server with hot reload
CMD ["pnpm", "--filter", "web", "dev", "--host", "0.0.0.0"]

