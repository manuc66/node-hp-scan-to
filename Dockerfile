FROM node:alpine as build
WORKDIR /app

ARG S6_OVERLAY_VERSION=3.0.0.2-2

ADD . .
RUN yarn install -d \
 && yarn build \
 && rm dist/*.d.ts dist/*.js.map

FROM node:alpine as app
ENV NODE_ENV production
ADD root/ /

# add S6 Overlay
ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-x86_64-${S6_OVERLAY_VERSION}.tar.xz /tmp
ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch-${S6_OVERLAY_VERSION}.tar.xz /tmp
ADD https://github.com/just-containers/s6-overlay/releases/v${S6_OVERLAY_VERSION}/download/s6-overlay-noarch.tar.xz /tmp
ADD https://github.com/just-containers/s6-overlay/releases/v${S6_OVERLAY_VERSION}/download/s6-overlay-x86_64.tar.xz /tmp
RUN tar -C / -Jxpf /tmp/s6-overlay-noarch-${S6_OVERLAY_VERSION}.tar.xz \
 && tar -C / -Jxpf /tmp/s6-overlay-x86_64-${S6_OVERLAY_VERSION}.tar.xz \
 && apk add --no-cache shadow tzdata # install shadow (for groupmod and usermod) and tzdata (for TZ env variable)

# add builded app
WORKDIR /app
COPY --from=build /app/dist/ /app/package.json ./
RUN yarn install -d \
 && yarn cache clean --force

VOLUME ["/scan"]
ENTRYPOINT ["/init"]
CMD ["/app.sh"]
