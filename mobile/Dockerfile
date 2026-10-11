# Metro dev server, so Expo Go on a phone can load the app.
# REACT_NATIVE_PACKAGER_HOSTNAME must be set to an address the phone can reach
# on METRO_PORT; it ends up in the exp:// URL Expo Go opens.
FROM node:24-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# CI=1: no interactive prompts and no file watching (the source is baked in).
ENV CI=1
ENV METRO_PORT=8081

# Expose port
EXPOSE 8081

CMD ["sh", "-c", "exec npx expo start --port \"$METRO_PORT\""]
