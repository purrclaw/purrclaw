FROM node:22-alpine AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev


FROM node:22-alpine AS dev

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY src ./src

ENV NODE_ENV=development

CMD ["node", "--watch", "src/index.js"]


FROM node:22-alpine AS runner

WORKDIR /app

RUN addgroup -S purrclaw && adduser -S purrclaw -G purrclaw

COPY --from=deps /app/node_modules ./node_modules
COPY src ./src

RUN mkdir -p workspace && chown -R purrclaw:purrclaw /app

USER purrclaw

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
