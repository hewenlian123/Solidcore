import { createHash } from "node:crypto";

const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

export type ParsedOrderCreationKey =
  | { ok: true; key: string | null }
  | { ok: false; error: string };

export function parseOrderCreationKey(raw: string | null): ParsedOrderCreationKey {
  if (raw == null) return { ok: true, key: null };
  const key = raw.trim();
  if (!key) return { ok: false, error: "Idempotency key cannot be empty." };
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return { ok: false, error: "Idempotency key is too long." };
  }
  return { ok: true, key };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonicalize((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return value;
}

export function buildOrderCreationFingerprint(payload: Record<string, unknown>) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}
