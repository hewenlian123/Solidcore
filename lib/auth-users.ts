import { Role } from "@/lib/rbac";

export type AuthUserRecord = {
  id: string;
  username: string;
  password: string;
  role: Role;
  name: string;
};

const USERS: AuthUserRecord[] = [
  { id: "u_admin", username: "admin", password: "admin123", role: "ADMIN", name: "Admin User" },
  { id: "u_sales", username: "sales", password: "sales123", role: "SALES", name: "Sales User" },
  { id: "u_wh", username: "warehouse", password: "warehouse123", role: "WAREHOUSE", name: "Warehouse User" },
];

export function authenticateUser(username: string, password: string): AuthUserRecord | null {
  const uname = username.trim().toLowerCase();
  const pwd = password.trim();
  const user = USERS.find((item) => item.username === uname && item.password === pwd);
  return user ?? null;
}

