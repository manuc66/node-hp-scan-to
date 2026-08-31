export interface WebhookConfig {
  /** URL to POST scan events to (n8n/Zapier webhook). */
  url: string;
  /** Optional secret used to sign the payload (HMAC-SHA256, hex). */
  secret?: string;
  /** Durable directory where pending events survive restarts. */
  outboxDir: string;
  /** Max delivery attempts before dead-lettering an event. */
  maxAttempts: number;
  keepFiles: boolean;
}