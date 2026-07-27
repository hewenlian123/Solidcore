type AttemptState = {
  failures: number;
  firstFailureAt: number;
  blockedUntil: number;
};

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const attempts = new Map<string, AttemptState>();

export function loginRateLimitStatus(key: string, now = Date.now()) {
  const state = attempts.get(key);
  if (!state) return { allowed: true, retryAfterSeconds: 0 };
  if (state.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((state.blockedUntil - now) / 1000),
    };
  }
  if (now - state.firstFailureAt >= WINDOW_MS) attempts.delete(key);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordLoginFailure(key: string, now = Date.now()) {
  const current = attempts.get(key);
  const state =
    !current || now - current.firstFailureAt >= WINDOW_MS
      ? { failures: 0, firstFailureAt: now, blockedUntil: 0 }
      : current;
  state.failures += 1;
  if (state.failures >= MAX_FAILURES) state.blockedUntil = now + BLOCK_MS;
  attempts.set(key, state);
}

export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
