FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app

COPY . .
COPY src/commitInfo.json /app/src/commitInfo.json

RUN corepack enable
RUN yarn install --frozen-lockfile
RUN yarn build \
 && rm dist/*.d.ts dist/*.js.map

# New stage to install only production dependencies
FROM --platform=$BUILDPLATFORM node:22-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack enable
RUN yarn install --immutable
RUN yarn workspaces focus --production --all

FROM node:22-alpine AS app
ENV NODE_ENV=production
ADD root/ /

# sets version for s6 overlay
ARG S6_SRC_DEP="ca-certificates xz-utils wget"
ARG S6_SRC_URL="https://github.com/just-containers/s6-overlay/releases/download"
ARG S6_VERSION=v3.2.0.2

# detect system arch then select the right version of s6
RUN export SYS_ARCH=$(uname -m); \
    case "$SYS_ARCH" in \
        aarch64 ) export S6_ARCH='aarch64' ;; \
        arm64   ) export S6_ARCH='aarch64' ;; \
        armhf   ) export S6_ARCH='armhf'   ;; \
        arm*    ) export S6_ARCH='arm'     ;; \
        i4*     ) export S6_ARCH='i486'    ;; \
        i6*     ) export S6_ARCH='i686'    ;; \
        riscv64 ) export S6_ARCH='riscv64' ;; \
        s390*   ) export S6_ARCH='s390x'   ;; \
        *       ) export S6_ARCH='x86_64'  ;; \
    esac; \
    untar (){ \
        echo "⏬ Downloading $1"; \
        wget -nv -O- $1 | tar Jxp -C /; \
    }; \
    \
    echo "⬇️ Downloading s6 overlay:${S6_ARCH}-${S6_VERSION} for ${SYS_ARCH}" \
        && untar ${S6_SRC_URL}/${S6_VERSION}/s6-overlay-noarch.tar.xz \
        && untar ${S6_SRC_URL}/${S6_VERSION}/s6-overlay-${S6_ARCH}.tar.xz \
    echo "⬇️ Install shadow (for groupmod and usermod) and tzdata (for TZ env variable)" \
    && apk add --no-cache shadow tzdata curl bash

# Copy built app and production dependencies without yarn
WORKDIR /app
COPY --from=build /app/dist/ ./
COPY --from=build /app/package.json ./
COPY --from=deps /app/node_modules/ ./node_modules/

VOLUME ["/scan"]
ENTRYPOINT ["/init"]
CMD ["/app.sh"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

