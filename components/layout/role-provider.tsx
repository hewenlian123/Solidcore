"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Role, normalizeRole } from "@/lib/rbac";

type RoleContextValue = {
  role: Role;
  setRole: (role: Role) => void;
};

const RoleContext = createContext<RoleContextValue>({
  role: "ADMIN",
  setRole: () => {},
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>("ADMIN");

  useEffect(() => {
    const stored = localStorage.getItem("app-role");
    setRoleState(normalizeRole(stored));
  }, []);

  const setRole = (nextRole: Role) => {
    localStorage.setItem("app-role", nextRole);
    setRoleState(nextRole);
  };

  const value = useMemo(() => ({ role, setRole }), [role]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}
