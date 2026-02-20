# Multi-stage build for Delegatecall Surface Scanner

# Stage 1: Build backend
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --only=production=false
COPY backend ./backend
RUN cd backend && npm run build

# Stage 2: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend ./frontend
RUN cd frontend && npm run build

# Stage 3: Production runtime
FROM node:20-alpine
WORKDIR /app

# Install production dependencies for backend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --only=production

# Copy built backend
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/package.json ./backend/

# Copy built frontend
COPY --from=frontend-builder /app/frontend/.next ./frontend/.next
COPY --from=frontend-builder /app/frontend/public ./frontend/public
COPY --from=frontend-builder /app/frontend/package.json ./frontend/
COPY --from=frontend-builder /app/frontend/node_modules ./frontend/node_modules
COPY --from=frontend-builder /app/frontend/next.config.mjs ./frontend/

# Create startup script
RUN echo '#!/bin/sh\n\
cd /app/backend && node dist/server/server.js &\n\
cd /app/frontend && npm start\n\
wait' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 3000 4000

ENV NODE_ENV=production
ENV PORT=4000
ENV NEXT_PORT=3000

CMD ["/app/start.sh"]
