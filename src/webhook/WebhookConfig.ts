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
  keepFiles: boolean;
}