#!/usr/bin/with-contenv sh

ARGS="-d /scan "

if [ ! -z "$IP" ]; then
    ARGS="${ARGS} -ip ${IP}"
fi

if [ ! -z "$NAME" ]; then
    ARGS="${ARGS} -n ${NAME}"
fi

if [ ! -z "$PATTERN" ]; then
    ARGS="${ARGS} -p ${PATTERN}"
fi

cd /app

s6-setuidgid node \
    node index.js $ARGS