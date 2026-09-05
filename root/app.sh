#!/command/with-contenv bash

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

if [ "$MAIN_COMMAND" != "adf-autoscan" ]; then
  if [ -n "$LABEL" ]; then
      ARGS+=("-l" "$LABEL")
  fi
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

if [ -n "$MODE" ]; then
    ARGS+=("--mode" "$MODE")
fi

if [ -n "$PAPER_SIZE" ]; then
    ARGS+=("--paper-size" "$PAPER_SIZE")
fi

if [ -n "$PAPER_ORIENTATION" ]; then
    ARGS+=("--paper-orientation" "$PAPER_ORIENTATION")
fi

if [ -n "$PAPER_DIM" ]; then
    ARGS+=("--paper-dim" "$PAPER_DIM")
fi

# Check if the variable exists (defined)
if [ -v ADD_EMULATED_DUPLEX ]; then
    # Add the emulated duplex scanning option
    ARGS+=("--add-emulated-duplex")

    # Check if the variable is not empty and dump its value
    if [ -n "$ADD_EMULATED_DUPLEX" ]; then
        ARGS+=("$ADD_EMULATED_DUPLEX")
    fi
fi

if [ -n "$PAPERLESS_POST_DOCUMENT_URL" ]; then
    ARGS+=("-s" "$PAPERLESS_POST_DOCUMENT_URL")
fi

if [ -n "$PAPERLESS_TOKEN_FILE" ]; then
    ARGS+=("--paperless-token-file" "$PAPERLESS_TOKEN_FILE")
elif [ -n "$PAPERLESS_TOKEN" ]; then
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

if [ -n "$WEBHOOK_URL" ]; then
    ARGS+=("--webhook-url" "$WEBHOOK_URL")
fi

if [ -n "$WEBHOOK_AUTH" ]; then
    ARGS+=("--webhook-auth" "$WEBHOOK_AUTH")
fi

if [ -n "$WEBHOOK_AUTH_HEADER" ]; then
    ARGS+=("--webhook-auth-header" "$WEBHOOK_AUTH_HEADER")
fi

if [ -n "$WEBHOOK_SECRET_FILE" ]; then
    ARGS+=("--webhook-secret-file" "$WEBHOOK_SECRET_FILE")
elif [ -n "$WEBHOOK_SECRET" ]; then
    ARGS+=("--webhook-secret" "$WEBHOOK_SECRET")
fi

if [ -n "$WEBHOOK_TOKEN" ]; then
    ARGS+=("--webhook-token" "$WEBHOOK_TOKEN")
fi

if [ -n "$WEBHOOK_USERNAME" ]; then
    ARGS+=("--webhook-username" "$WEBHOOK_USERNAME")
fi

if [ -n "$WEBHOOK_PASSWORD" ]; then
    ARGS+=("--webhook-password" "$WEBHOOK_PASSWORD")
fi




if [ -n "$CMDLINE" ]; then
    # Split CMDLINE into words and add to ARGS
    set -- $CMDLINE
    ARGS+=("$@")
fi

cd /app || exit

echo "Starting"
s6-setuidgid node \
    node index.js "${ARGS[@]}"
