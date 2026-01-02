FROM lukemathwalker/cargo-chef:latest-rust-alpine AS chef
WORKDIR /app

# Install build dependencies for openssl-sys (vendored)
# perl is required for openssl configuration
RUN apk add --no-cache \
    build-base \
    perl \
    openssl-dev \
    pkgconfig \
    clang-dev \
    llvm-dev

# Allow linking libclang on musl (chef stage)
ENV RUSTFLAGS="-C target-feature=-crt-static"

# Planner stage
FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

# Cache Builder stage
FROM chef AS cacher
COPY --from=planner /app/recipe.json recipe.json
# Build dependencies - this is the cached layer
RUN cargo chef cook --release --recipe-path recipe.json

# Final Builder stage
# Use the SAME base image to ensure compatibility and path matching
FROM chef AS builder

# Install build dependencies (Node.js, build tools)
RUN apk add --no-cache \
    curl \
    build-base \
    perl \
    llvm-dev \
    clang-dev \
    nodejs \
    npm

# Allow linking libclang on musl
ENV RUSTFLAGS="-C target-feature=-crt-static"

ARG POSTHOG_API_KEY
ARG POSTHOG_API_ENDPOINT

ENV VITE_PUBLIC_POSTHOG_KEY=$POSTHOG_API_KEY
ENV VITE_PUBLIC_POSTHOG_HOST=$POSTHOG_API_ENDPOINT

WORKDIR /app

# Copy compiled dependencies from cacher
# Since we use the same base image, paths like /usr/local/cargo match correctly
COPY --from=cacher /app/target target
COPY --from=cacher /app/target/release/deps target/release/deps
COPY --from=cacher /usr/local/cargo /usr/local/cargo

# Copy package files for frontend
COPY package*.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package*.json ./frontend/
COPY npx-cli/package*.json ./npx-cli/

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install

# Copy source code
COPY . .

# Build application
RUN npm run generate-types
RUN cd frontend && pnpm run build
RUN cargo build --release --bin server

# Runtime stage
FROM alpine:latest AS runtime

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    tini \
    libgcc \
    wget \
    bash \
    git \
    go \
    nodejs \
    npm \
    # github-cli provides the 'gh' command
    github-cli

# Install gemini-cli via npm
RUN npm install -g @google/gemini-cli

# Create app user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Copy binary from builder
COPY --from=builder /app/target/release/server /usr/local/bin/server

# Create repos directory and set permissions
RUN mkdir -p /repos && \
    chown -R appuser:appgroup /repos

# Switch to non-root user
USER appuser

# Set runtime environment
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

# Set working directory
WORKDIR /repos

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider "http://${HOST:-localhost}:${PORT:-3000}" || exit 1

# Run the application
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["server"]
