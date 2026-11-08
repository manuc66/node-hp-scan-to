---
layout: default
---

# Sending scans elsewhere

The app delivers to a local folder, Paperless-ngx, Nextcloud and S3. Any other
destination lives outside it and reaches the scan through a
[post-processing command](../#post-processing-command) or a webhook event. The
recipes below are starting points to copy and adapt.

## Before you copy a recipe

- **Commands run without a shell.** Each recipe is a program plus arguments, so
  pipes, redirections and `$(...)` are not interpreted. When you need them, put
  them in a script and call that: `/usr/local/bin/send-scan "{input}"`.
- **A failing command does not stop the scan.** The original file is kept, the
  error is logged and the scan carries on. An exit code cannot abort a scan, and
  nothing runs the command again.
- **A command runs once per file and before upload.** `--post-command-pdf` runs
  on each generated PDF and `--post-command-image` on each page image. These
  recipes use the PDF one so that a multi-page scan stays one message, and that
  message goes out even if a later upload fails. This holds for `--pdf` and
  merged-PDF flows; with `--paperless-always-send-as-pdf-file`, Paperless gets
  one PDF per page, so a mail or chat recipe sends one message per page.
- **Keep secrets off the command line.** A failed command is logged with its
  arguments, so use the tool's own configuration file or a script. Keep that
  file readable only by the account running the scan (`chmod 600`), and mount
  it as a secret or volume rather than copying it into an image layer.
- **In the container, the program must be in the image.** The published image
  ships `curl`. For the others, extend it with
  `FROM manuc66/node-hp-scan-to:latest` and `apk add --no-cache mutt` or
  `cups-client` (for `lp`), then set `POST_COMMAND_PDF`. Alpine has no `sendemail`
  package.

## Mail

With `mutt`, the sender and the SMTP server come from its configuration file.
The command gets no standard input, so the message goes out with an empty body:

```sh
node-hp-scan-to --address <printer> single-scan --pdf \
  --post-command-pdf 'mutt -s "New scan" -a "{input}" -- office@example.com'
```

With `sendemail` and a relay that needs no login:

```sh
node-hp-scan-to --address <printer> single-scan --pdf \
  --post-command-pdf 'sendemail -f scanner@example.com -t office@example.com -u "New scan" -m "Scan attached." -a "{input}" -s smtp.example.com:25'
```

A mail gateway can take the webhook event instead. The event describes the scan
and does not carry the file, so pair it with a target the gateway can read from,
and fetch the document from `files[].location` or `delivery[].references`:

```sh
node-hp-scan-to --address <printer> single-scan --pdf \
  --nextcloud-url <url> --nextcloud-username <user> --nextcloud-password-file <file> \
  --webhook-url https://gateway.example.com/scans \
  --webhook-secret-file /run/secrets/scan-webhook
```

Delivery is one POST with a 10 second timeout and no retry. The
[webhook contract](https://github.com/manuc66/node-hp-scan-to/blob/master/protocol_doc/webhook/openapi.yaml)
describes the event, its signature and its `idempotency-key` header.

## Chat

Telegram takes a file in one request, so `curl` is enough. Use your own chat ID,
and keep the token in a `curl` configuration file:

```sh
node-hp-scan-to --address <printer> single-scan --pdf \
  --post-command-pdf "curl --fail --silent --show-error --config /etc/node-hp-scan-to/telegram.curl --form chat_id=123456789 --form 'document=@\"{input}\"'"
```

```text
# /etc/node-hp-scan-to/telegram.curl
url = "https://api.telegram.org/bot<token>/sendDocument"
```

Keep `--fail`: without it `curl` exits with 0 on an HTTP error, and the failure
never reaches the log. Keep the inner double quotes too: `curl` needs them for a
path containing `,` or `;`.

Matrix and Slack need more than one request to post a file, so use a webhook
receiver: an automation platform such as n8n, Node-RED or Home Assistant, or a
small relay. It takes the event, fetches the file as in the mail gateway above
and posts it through your bridge. For a receiver outside your network, add
`--webhook-payload minimal`, which drops the scanner IP, the printer destination
label and every local path.

## Another printer

`<queue>` is a CUPS or IPP queue on the host running the scan:

```sh
node-hp-scan-to --address <printer> single-scan --pdf \
  --post-command-pdf 'lp -d <queue> "{input}"'
```

The print job leaves the host running the scan, not the printer that scanned, so
that host has to reach the target printer. `lp` exits with 0 once the job is
queued, so a later printer error does not show up in this log.

## Why these stay outside

Each destination brings credentials, a retry policy and a protocol dialect that
this project does not own. Kept outside, a recipe can be fixed without a release,
and the credentials for those destinations stay with the tool that sends to them.
A gap in the hooks themselves, such as scan metadata a command cannot see, is
still a good issue to open.

---

Back to [README](../)
