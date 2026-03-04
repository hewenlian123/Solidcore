import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { Role, normalizeRole } from "@/lib/rbac";

export type SessionUser = {
  userId: string;
  role: Role;
  name: string;
};

type SessionPayload = SessionUser & {
  exp: number;
};

const SESSION_COOKIE_NAME = "solidcore_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function getSessionSecret() {
  return process.env.AUTH_SESSION_SECRET || "solidcore-dev-session-secret-change-me";
}

function toBase64Url(text: string) {
  return Buffer.from(text, "utf8").toString("base64url");
}

function fromBase64Url(text: string) {
  return Buffer.from(text, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

export function createSessionToken(user: SessionUser) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload: SessionPayload = { ...user, exp };
  const payloadEncoded = toBase64Url(JSON.stringify(payload));
  const signature = sign(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

export function verifySessionToken(token: string | null | undefined): SessionUser | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadEncoded, signature] = parts;
  const expected = sign(payloadEncoded);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
  try {
    const payload = JSON.parse(fromBase64Url(payloadEncoded)) as Partial<SessionPayload>;
    const exp = Number(payload.exp ?? 0);
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
    const role = normalizeRole(String(payload.role ?? ""));
    const userId = String(payload.userId ?? "").trim();
    const name = String(payload.name ?? "").trim();
    if (!userId || !name) return null;
    return { userId, role, name };
  } catch {
    return null;
  }
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function getSessionFromRequest(request: NextRequest): SessionUser | null {
  return verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null);
}

