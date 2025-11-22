# Backend Dockerfile with hot reload support
FROM node:20-alpine

# Install OpenSSL and other required dependencies for Prisma
# Also install PostgreSQL client for database management in entrypoint
RUN apk add --no-cache openssl openssl-dev libc6-compat postgresql-client

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy root package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all workspace packages for dependency resolution
COPY packages ./packages
COPY apps/server ./apps/server

# Copy and setup entrypoint script
COPY apps/server/docker-entrypoint.sh /app/apps/server/
RUN chmod +x /app/apps/server/docker-entrypoint.sh

# Install all dependencies (including devDependencies for hot reload)
RUN pnpm install --frozen-lockfile

# Build the shared core package
RUN pnpm --filter @suilens/core build

# Generate Prisma Client
WORKDIR /app/apps/server
RUN pnpm prisma generate

# Expose port
EXPOSE 3001

# Set working directory back to app root for pnpm workspace context
WORKDIR /app

# Start development server with hot reload (tsx watch)
# The entrypoint script handles database setup and migrations
CMD ["/app/apps/server/docker-entrypoint.sh"]

