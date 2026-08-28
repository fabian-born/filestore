FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
WORKDIR /app
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src
COPY scripts ./scripts

ENV DATA_DIR=/app/data
VOLUME /app/data

EXPOSE 3452

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3452/api/version', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/index.js"]
