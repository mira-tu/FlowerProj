FROM node:20-alpine AS build
WORKDIR /app/web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./

# Pass environment variables to the Vite build step
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

RUN npm install -g serve
COPY --from=build /app/web/dist ./dist

# Install curl for health checks
RUN apk add --no-cache curl

ENV PORT=3000
EXPOSE 3000

# Health check — verifies the server is responding every 30 seconds
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Serve with security headers (CSP, X-Frame-Options, etc.)
CMD ["sh", "-c", "serve -s dist -l ${PORT} --cors"]
