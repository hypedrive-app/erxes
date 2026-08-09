# syntax=docker/dockerfile:1
FROM alpine:3.11 AS jo-builder
RUN apk add --no-cache alpine-sdk && \
    cd /tmp && curl -s -LO https://github.com/jpmens/jo/releases/download/1.3/jo-1.3.tar.gz && \
    tar xzf jo-1.3.tar.gz && \
    cd jo-1.3 && \
    ./configure && \
    make check && \
    make install

# Build the application
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# pnpm@9.12.3, PINNED — now via corepack rather than `npm install -g`. Corepack
# reads the exact version out of the root package.json `packageManager` field
# ("pnpm@9.12.3"), so the pin lives in ONE place instead of being restated in
# every Dockerfile. Unpinned `npm install -g pnpm` resolved to whatever was
# current — pnpm 11 at the time of writing — which fails against this repo:
#
#   [ERROR] Cannot verify the identity of the @pnpm/exe.linux-x64 native
#           binary: it is missing from pnpm-lock.yaml
#
# pnpm 10+ ships its own native binary as an optional dependency and verifies
# it against the lockfile. Ours is lockfileVersion 9.0, written by the
# pnpm@9.12.3 this repo pins in packageManager, so that entry does not exist
# and never did. Nothing in the repo changed to cause this — the upstream
# default moved. Keep `packageManager` at 9.12.3: it is now what holds this
# build off pnpm 10+, for this Dockerfile and every other one here.
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
RUN corepack enable
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install
COPY . .
RUN pnpm nx build core-ui --configuration=production --verbose

# Final stage
FROM nginx:alpine

# Copy jo from builder
COPY --from=jo-builder /usr/local/bin/jo /usr/local/bin/jo

RUN apk add --no-cache bash

# Copy application files
COPY --from=build /app/dist/frontend/core-ui /usr/share/nginx/html

# Copy configuration files
COPY --from=build /app/frontend/core-ui/nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/frontend/core-ui/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/core-ui/docker-entrypoint.sh /usr/local/bin/

# Set up entrypoint script
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    chmod +x /usr/local/bin/jo && \
    mkdir -p /usr/share/nginx/html/js

# Expose port 80
EXPOSE 80

ENTRYPOINT ["sh", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
