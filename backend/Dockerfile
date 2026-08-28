FROM node:20-alpine
WORKDIR /app
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV DATA_DIR=/app/data
VOLUME /app/data

EXPOSE 3452
CMD ["node", "src/index.js"]
