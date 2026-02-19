FROM node:20-alpine AS build
WORKDIR /app/web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache gettext \
  && npm install -g serve

COPY --from=build /app/web/dist ./dist
COPY web/public/env.template.js ./env.template.js

ENV PORT=3000
EXPOSE 3000

CMD ["sh", "-c", "envsubst < /app/env.template.js > /app/dist/env.js && serve -s dist -l ${PORT}"]
