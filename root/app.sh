#!/command/with-contenv sh

# Initialize an array for arguments

if [ -n "$MAIN_COMMAND" ]; then
    ARGS=("${MAIN_COMMAND}")
else
    ARGS=("listen")
fi

ARGS+=("--health-check")

if [ -n "$IP" ]; then
    ARGS+=("-a" "$IP")
fi

if [ -n "$LABEL" ]; then
    ARGS+=("-l" "$LABEL")
fi

if [ -n "$NAME" ]; then
    ARGS+=("-n" "$NAME")
fi

if [ -n "$DIR" ]; then
    ARGS+=("-d" "$DIR")
else
    ARGS+=("-d" "/scan")
fi

if [ -n "$TEMP_DIR" ]; then
    ARGS+=("-t" "$TEMP_DIR")
fi

if [ -n "$PATTERN" ]; then
    ARGS+=("-p" "$PATTERN")
fi

if [ -n "$RESOLUTION" ]; then
    ARGS+=("-r" "$RESOLUTION")
fi

if [ -n "$PAPERLESS_POST_DOCUMENT_URL" ]; then
    ARGS+=("-s" "$PAPERLESS_POST_DOCUMENT_URL")
fi

if [ -n "$PAPERLESS_TOKEN" ]; then
    ARGS+=("-o" "$PAPERLESS_TOKEN")
fi

if [ -n "$KEEP_FILES" ]; then
    ARGS+=("-k")
fi

if [ -n "$NEXTCLOUD_URL" ]; then
    ARGS+=("--nextcloud-url" "$NEXTCLOUD_URL")
fi

if [ -n "$NEXTCLOUD_UPLOAD_FOLDER" ]; then
    ARGS+=("--nextcloud-upload-folder" "$NEXTCLOUD_UPLOAD_FOLDER")
fi

if [ -n "$NEXTCLOUD_USERNAME" ]; then
    ARGS+=("--nextcloud-username" "$NEXTCLOUD_USERNAME")
fi

if [ -n "$NEXTCLOUD_PASSWORD_FILE" ]; then
    ARGS+=("--nextcloud-password-file" "$NEXTCLOUD_PASSWORD_FILE")
elif [ -n "$NEXTCLOUD_PASSWORD" ]; then
    ARGS+=("--nextcloud-password" "$NEXTCLOUD_PASSWORD")
fi

if [ -n "$CMDLINE" ]; then
    # Split CMDLINE into words and add to ARGS
    set -- $CMDLINE
    ARGS+=("$@")
fi

cd /app

echo "Starting"
s6-setuidgid node \
    node index.js "${ARGS[@]}" "$@"
