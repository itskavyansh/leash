import { Rules } from "./types";

export const BASE_DEFAULT_ALLOWED_RECIPIENTS: readonly string[] = [
  "sb-sub@example.com",
  "kavyansh@gmail.com",
];

// Simple, robust email regex matching user@domain.tld
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parses and normalizes a comma-separated list of recipient emails:
 * - splits by comma
 * - trims whitespace
 * - lowercases
 * - filters out empty strings and invalid email formats
 * - deduplicates preserving insertion order
 */
export function parseAllowedRecipientsEnv(envValue?: string | null): string[] {
  if (!envValue || typeof envValue !== "string") {
    return [];
  }

  const list = envValue
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0 && EMAIL_REGEX.test(item));

  return Array.from(new Set(list));
}

/**
 * Returns the resolved default allowed recipients list:
 * BASE_DEFAULT_ALLOWED_RECIPIENTS plus any valid, deduplicated emails
 * from process.env.DEFAULT_ALLOWED_RECIPIENTS.
 */
export function getDefaultAllowedRecipients(): string[] {
  const envRecipients = parseAllowedRecipientsEnv(
    process.env.DEFAULT_ALLOWED_RECIPIENTS
  );
  const combined = [...BASE_DEFAULT_ALLOWED_RECIPIENTS, ...envRecipients];
  return Array.from(new Set(combined.map((email) => email.trim().toLowerCase())));
}

/**
 * Returns a fresh copy of the default policy rules, dynamically resolving
 * allowed recipients from base defaults and DEFAULT_ALLOWED_RECIPIENTS env var.
 */
export function getDefaultRules(): Rules {
  return {
    autoApproveLimit: 200,
    hardLimit: 5000,
    dailyCap: 1000,
    allowedRecipients: getDefaultAllowedRecipients(),
    blockedActionTypes: [],
  };
}

