#!/command/with-contenv sh

# Initialize an array for arguments

if [ ! -z "$MAIN_COMMAND" ]; then
    ARGS=("${MAIN_COMMAND}")
else
    ARGS=("listen")
fi

ARGS+=("--health-check")

if [ ! -z "$IP" ]; then
    ARGS+=("-a" "$IP")
fi

if [ ! -z "$LABEL" ]; then
    ARGS+=("-l" "$LABEL")
fi

if [ ! -z "$NAME" ]; then
    ARGS+=("-n" "$NAME")
fi

if [ ! -z "$DIR" ]; then
    ARGS+=("-d" "$DIR")
else
    ARGS+=("-d" "/scan")
fi

if [ ! -z "$TEMP_DIR" ]; then
    ARGS+=("-t" "$TEMP_DIR")
fi

if [ ! -z "$PATTERN" ]; then
    ARGS+=("-p" "$PATTERN")
fi

if [ ! -z "$RESOLUTION" ]; then
    ARGS+=("-r" "$RESOLUTION")
fi

if [ ! -z "$PAPERLESS_POST_DOCUMENT_URL" ]; then
    ARGS+=("-s" "$PAPERLESS_POST_DOCUMENT_URL")
fi

if [ ! -z "$PAPERLESS_TOKEN" ]; then
    ARGS+=("-o" "$PAPERLESS_TOKEN")
fi

if [ ! -z "$KEEP_FILES" ]; then
    ARGS+=("-k")
fi

if [ ! -z "$NEXTCLOUD_URL" ]; then
    ARGS+=("--nextcloud-url" "$NEXTCLOUD_URL")
fi

if [ ! -z "$NEXTCLOUD_UPLOAD_FOLDER" ]; then
    ARGS+=("--nextcloud-upload-folder" "$NEXTCLOUD_UPLOAD_FOLDER")
fi

if [ ! -z "$NEXTCLOUD_USERNAME" ]; then
    ARGS+=("--nextcloud-username" "$NEXTCLOUD_USERNAME")
fi

if [ ! -z "$NEXTCLOUD_PASSWORD_FILE" ]; then
    ARGS+=("--nextcloud-password-file" "$NEXTCLOUD_PASSWORD_FILE")
elif [ ! -z "$NEXTCLOUD_PASSWORD" ]; then
    ARGS+=("--nextcloud-password" "$NEXTCLOUD_PASSWORD")
fi

if [ ! -z "$CMDLINE" ]; then
    # Split CMDLINE into words and add to ARGS
    set -- $CMDLINE
    ARGS+=("$@")
fi

cd /app

echo "Starting"
s6-setuidgid node \
    node index.js "${ARGS[@]}" "$@"
