# Isolated Wine + capture environment for reverse-engineering the HP
# proprietary Windows driver (issue #1019).
#
# Security note: this container uses its OWN network namespace (bridge,
# no --network=host). All capture happens inside the container; nothing
# on the host network or host certificate store is touched.
#
# Method: Wine's schannel is built on GnuTLS. A small LD_PRELOAD shim
# (sslkeylog-gnutls.c.txt) enables gnutls_session_set_keylog_function(), which
# Wine never calls itself. Combined with tcpdump + tshark, the HTTPS traffic
# of the Windows driver is decrypted in the clear.
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV WINEARCH=win64
ENV WINEDEBUG=-all
ENV PATH="/opt/wine-devel/bin:${PATH}"

# WineHQ repository. Pin amd64/i386 to the SAME version: the bookworm repo
# can temporarily have a newer amd64 than i386 (breaks the dependency).
RUN dpkg --add-architecture i386 \
    && apt-get update \
    && apt-get install -y --no-install-recommends wget gnupg ca-certificates \
    && mkdir -p /etc/apt/keyrings \
    && wget -qO- https://dl.winehq.org/wine-builds/winehq.key | gpg --dearmor -o /etc/apt/keyrings/winehq.gpg \
    && echo "deb [arch=amd64,i386 signed-by=/etc/apt/keyrings/winehq.gpg] https://dl.winehq.org/wine-builds/debian/ bookworm main" > /etc/apt/sources.list.d/winehq.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
         wine-devel=11.10~bookworm-1 \
         wine-devel-i386=11.10~bookworm-1 \
         wine-devel-amd64=11.10~bookworm-1 \
    && rm -rf /var/lib/apt/lists/*

# Tools: Xvfb (headless GUI), tcpdump/tshark (capture + decrypt),
# gcc + libgnutls (build the keylog shim), mono (Wine Mono for .NET-based
# installers), OCR + UI driving (tesseract, imagemagick, xdotool), misc.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        xvfb \
        tcpdump \
        tshark \
        gcc libgnutls28-dev \
        mono-devel mono-utils \
        winbind \
        ca-certificates \
        curl wget unzip cabextract xz-utils \
        procps net-tools iproute2 iputils-ping \
        xdotool x11-apps \
        tesseract-ocr imagemagick \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /capture
VOLUME /capture