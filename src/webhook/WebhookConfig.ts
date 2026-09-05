export type WebhookAuthType = "none" | "hmac" | "bearer" | "basic";

export interface WebhookConfig {
  /** URL to POST scan events to (n8n/Zapier webhook). */
  url: string;
  /** Auth scheme applied to the request. "none" when not configured. */
  auth: WebhookAuthType;
  /** Header name carrying the HMAC signature (default "x-webhook-signature"). */
  authHeader: string;
  /** HMAC-SHA256 signing secret (hex, sent per authHeader). */
  secret?: string;
  /** Bearer token (sent as Authorization: Bearer <token>). */
  token?: string;
  /** Basic auth username (sent as Authorization: Basic base64(user:pass)). */
  username?: string;
  /** Basic auth password. */
  password?: string;
  /** Durable directory where pending events survive restarts. */
  outboxDir: string;
  /** Max delivery attempts before dead-lettering an event. */
  maxAttempts: number;
  /**
   * When false (default) the event is sent best-effort: a single POST, logged
   * on failure, nothing persisted. When true the event is written to the
   * outbox first and retried at startup and after each scan.
   */
  durableOutbox: boolean;
  keepFiles: boolean;
}

/**
 * Throws when the configured auth scheme requires credentials that are
 * missing, so an unsigned/unauthenticated request is never sent silently.
 * "none" (and schemes whose credentials are present) pass.
 */
export function assertWebhookAuthCredentials(
  webhookConfig: WebhookConfig,
): void {
  if (webhookConfig.auth === "hmac" && webhookConfig.secret === undefined) {
    throw new Error(
      "Webhook auth is 'hmac' but no secret is configured: set webhook-secret or webhook-secret-file",
    );
  }
  if (webhookConfig.auth === "bearer" && webhookConfig.token === undefined) {
    throw new Error(
      "Webhook auth is 'bearer' but no token is configured: set webhook-token",
    );
  }
  if (
    webhookConfig.auth === "basic" &&
    (webhookConfig.username === undefined ||
      webhookConfig.password === undefined)
  ) {
    throw new Error(
      "Webhook auth is 'basic' but both a username and a password are required: set webhook-username and webhook-password",
    );
  }
}