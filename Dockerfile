FROM node:18-alpine  as build
WORKDIR /app

ADD . .
RUN yarn install -d \
 && yarn build \
 && rm dist/*.d.ts dist/*.js.map

FROM node:18-alpine as app
ENV NODE_ENV production
ADD root/ /

# sets version for s6 overlay
ARG S6_SRC_DEP="ca-certificates xz-utils wget"
ARG S6_SRC_URL="https://github.com/just-containers/s6-overlay/releases/download"
ARG S6_VERSION=v3.1.1.2

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
    && apk add --no-cache shadow tzdata

# add builded app
WORKDIR /app
COPY --from=build /app/dist/ /app/package.json ./
RUN yarn install -d \
 && yarn cache clean --force

VOLUME ["/scan"]
ENTRYPOINT ["/init"]
CMD ["/app.sh"]

