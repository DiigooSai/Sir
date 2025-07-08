
FROM --platform=$BUILDPLATFORM node:lts-slim AS base
RUN npm i -g bun
COPY  bun.lockb /app/bun.lockb
COPY . /app
WORKDIR /app
RUN bun install
CMD ["bun", "run", "start:prod"]


