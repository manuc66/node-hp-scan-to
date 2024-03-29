#!/command/with-contenv sh

ARGS="-d /scan "

if [ ! -z "$IP" ]; then
    ARGS="${ARGS} -ip ${IP}"
fi

if [ ! -z "$LABEL" ]; then
    ARGS="${ARGS} -l ${LABEL}"
fi

if [ ! -z "$NAME" ]; then
    ARGS="${ARGS} -n ${NAME}"
fi

if [ ! -z "$DIR" ]; then
    ARGS="${ARGS} -d ${DIR}"
fi

if [ ! -z "$TEMP_DIR" ]; then
    ARGS="${ARGS} -t ${TEMP_DIR}"
fi

if [ ! -z "$PATTERN" ]; then
    ARGS="${ARGS} -p ${PATTERN}"
fi

if [ ! -z "$RESOLUTION" ]; then
    ARGS="${ARGS} -r ${RESOLUTION}"
fi

if [ ! -z "$CMDLINE" ]; then
    ARGS="${ARGS} ${CMDLINE}"
fi

cd /app

echo "Starting"
s6-setuidgid node \
    node index.js $ARGS "$@"
