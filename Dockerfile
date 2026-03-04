# ============================================================
# Campus Reclaimed — Multi-stage Docker Build
# Stage 1: Build the React app with Vite
# Stage 2: Serve with nginx
# ============================================================

# ── Stage 1: Build ──
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install --silent

# Copy source code
COPY . .

# Build args for Supabase credentials (injected at build time)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Build the production bundle
RUN npm run build

# ── Stage 2: Serve ──
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 8080 (App Runner expects this)
EXPOSE 8080

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
