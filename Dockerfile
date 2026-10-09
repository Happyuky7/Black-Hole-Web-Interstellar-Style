# syntax=docker/dockerfile:1

# ---- build: install deps, fetch the soundtrack (optional), produce dist/ ----
FROM node:22-alpine AS build
# Set to 0 to build without music: docker build --build-arg FETCH_MUSIC=0 .
ARG FETCH_MUSIC=1
# Public URL used in canonical links, social previews, robots.txt and sitemap.xml
ARG SITE_URL=https://gargantua.happyuky7.com
ENV SITE_URL=$SITE_URL
WORKDIR /app
RUN corepack enable
# yt-dlp + ffmpeg only exist in this throwaway stage; failures are non-fatal.
RUN if [ "$FETCH_MUSIC" = "1" ]; then \
      apk add --no-cache python3 ffmpeg && \
      wget -qO /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && \
      chmod +x /usr/local/bin/yt-dlp || echo "yt-dlp unavailable, building without music"; \
    fi
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN if [ "$FETCH_MUSIC" != "1" ]; then export SKIP_MUSIC=1; fi; pnpm build

# ---- runtime: just Node + the static server, no node_modules ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4173 \
    HOST=0.0.0.0
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server.mjs package.json ./
USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4173/healthz || exit 1
CMD ["node", "server.mjs"]
