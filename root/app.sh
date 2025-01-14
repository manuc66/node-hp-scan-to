#!/command/with-contenv sh

ARGS="--health-check -d /scan "

if [ ! -z "$IP" ]; then
    ARGS="${ARGS} -a ${IP}"
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

if [ ! -z "$PAPERLESS_POST_DOCUMENT_URL" ]; then
    ARGS="${ARGS} -s ${PAPERLESS_POST_DOCUMENT_URL}"
fi

if [ ! -z "$PAPERLESS_TOKEN" ]; then
    ARGS="${ARGS} -o ${PAPERLESS_TOKEN}"
fi

if [ ! -z "$KEEP_FILES" ]; then
    ARGS="${ARGS} -k"
fi

if [ ! -z "$NEXTCLOUD_URL" ]; then
    ARGS="${ARGS} --nextcloud-url ${NEXTCLOUD_URL}"
fi

if [ ! -z "$NEXTCLOUD_UPLOAD_FOLDER" ]; then
    ARGS="${ARGS} --nextcloud-upload-folder ${NEXTCLOUD_UPLOAD_FOLDER}"
fi

if [ ! -z "$NEXTCLOUD_USERNAME" ]; then
    ARGS="${ARGS} --nextcloud-username ${NEXTCLOUD_USERNAME}"
fi

if [ ! -z "$NEXTCLOUD_PASSWORD_FILE" ]; then
    ARGS="${ARGS} --nextcloud-password-file ${NEXTCLOUD_PASSWORD_FILE}"
elif [ ! -z "$NEXTCLOUD_PASSWORD" ]; then
    ARGS="${ARGS} --nextcloud-password ${NEXTCLOUD_PASSWORD}"
fi

if [ ! -z "$CMDLINE" ]; then
    ARGS="${ARGS} ${CMDLINE}"
fi

if [ ! -z "$MAIN_COMMAND" ]; then
    ARGS="${MAIN_COMMAND} ${ARGS}"
fi

cd /app

echo "Starting"
s6-setuidgid node \
    node index.js $ARGS "$@"
