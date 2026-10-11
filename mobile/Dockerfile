# Build the Expo web bundle (app.json: web.output = "static")
FROM node:24-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# Export the static web build to /app/dist
RUN npx expo export --platform web --output-dir dist

# Serve the bundle with nginx
FROM nginx:1.29-alpine

# The official image runs envsubst over /etc/nginx/templates/*.template on
# startup, so API_UPSTREAM can be set per deployment.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

# Where /api/ requests are proxied to (the Go API from the root Dockerfile).
ENV API_UPSTREAM=http://trucker:8081

# Expose port
EXPOSE 8080
