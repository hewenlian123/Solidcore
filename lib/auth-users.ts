import { timingSafeEqual } from "node:crypto";
import { Role } from "@/lib/rbac";

export type AuthUserRecord = {
  id: string;
  username: string;
  password: string;
  role: Role;
  name: string;
};

function configuredUser(
  key: "ADMIN" | "SALES" | "WAREHOUSE",
  id: string,
  fallbackUsername: string,
  fallbackName: string,
): AuthUserRecord | null {
  const password = process.env[`SOLIDCORE_${key}_PASSWORD`];
  if (!password) return null;
  return {
    id,
    username:
      process.env[`SOLIDCORE_${key}_USERNAME`]?.trim().toLowerCase() ||
      fallbackUsername,
    password,
    role: key,
    name: process.env[`SOLIDCORE_${key}_NAME`]?.trim() || fallbackName,
  };
}

function configuredUsers() {
  return [
    configuredUser("ADMIN", "u_admin", "admin", "SolidCore Owner"),
    configuredUser("SALES", "u_sales", "sales", "SolidCore Sales"),
    configuredUser(
      "WAREHOUSE",
      "u_warehouse",
      "warehouse",
      "SolidCore Warehouse",
    ),
  ].filter((user): user is AuthUserRecord => Boolean(user));
}

function equalSecret(input: string, expected: string) {
  const inputBuffer = Buffer.from(input, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (inputBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(inputBuffer, expectedBuffer);
}

export function authenticateUser(
  username: string,
  password: string,
): AuthUserRecord | null {
  const uname = username.trim().toLowerCase();
  const user = configuredUsers().find(
    (item) => item.username === uname && equalSecret(password, item.password),
  );
  return user ?? null;
}
