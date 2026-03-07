"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@/lib/rbac";

type RoleContextValue = {
  role: Role;
  userName: string;
  authenticated: boolean;
  loading: boolean;
  setRole: (role: Role) => void | Promise<void>;
};

const RoleContext = createContext<RoleContextValue>({
  role: "ADMIN",
  userName: "",
  authenticated: false,
  loading: true,
  setRole: () => {},
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [role, setRoleState] = useState<Role>("ADMIN");
  const [userName, setUserName] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadSession = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const payload = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setAuthenticated(false);
          const currentPath = typeof window !== "undefined" ? window.location.pathname : "/dashboard";
          if (currentPath !== "/login") {
            router.replace(`/login?next=${encodeURIComponent(currentPath || "/dashboard")}`);
          }
          return;
        }
        setRoleState(payload?.data?.role ?? "ADMIN");
        setUserName(String(payload?.data?.name ?? ""));
        setAuthenticated(true);
      } catch {
        if (!cancelled) {
          setAuthenticated(false);
          const currentPath = typeof window !== "undefined" ? window.location.pathname : "/dashboard";
          if (currentPath !== "/login") {
            router.replace(`/login?next=${encodeURIComponent(currentPath || "/dashboard")}`);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadSession();
    return () => {
      cancelled = true;
    };
    // Run only on mount so navigation does not trigger a session refetch (fixes slow nav)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setRole = async (nextRole: Role) => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setRoleState(payload?.data?.role ?? nextRole);
    } catch {
      // keep UI resilient when session update fails
    }
  };

  const value = useMemo(
    () => ({ role, userName, authenticated, loading, setRole }),
    [authenticated, loading, role, userName],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}
