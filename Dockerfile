FROM node:22-alpine AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci --omit=dev


FROM node:22-alpine AS dev

WORKDIR /app

RUN apk add --no-cache python3 make g++ chromium nss freetype harfbuzz ca-certificates ttf-freefont

COPY package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci

COPY src ./src
COPY workspace ./workspace

ENV NODE_ENV=development
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

CMD ["node", "--watch", "src/index.js"]


FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
RUN addgroup -S purrclaw && adduser -S purrclaw -G purrclaw

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY workspace ./workspace

RUN mkdir -p /app/workspace && chown -R purrclaw:purrclaw /app

USER purrclaw

ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

CMD ["node", "src/index.js"]
