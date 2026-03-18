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

// Module-level cache: persists across React remounts within the same browser session.
// This prevents showing "Loading session..." on every page navigation.
type SessionCache = { role: Role; userName: string } | null;
let _sessionCache: SessionCache = null;
let _sessionPromise: Promise<SessionCache> | null = null;

async function fetchSession(): Promise<SessionCache> {
  if (_sessionCache) return _sessionCache;
  if (_sessionPromise) return _sessionPromise;

  _sessionPromise = fetch("/api/auth/session", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return null;
      const payload = await res.json().catch(() => ({}));
      const result: SessionCache = {
        role: payload?.data?.role ?? "ADMIN",
        userName: String(payload?.data?.name ?? ""),
      };
      _sessionCache = result;
      return result;
    })
    .catch(() => null)
    .finally(() => {
      _sessionPromise = null;
    });

  return _sessionPromise;
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [role, setRoleState] = useState<Role>(() => _sessionCache?.role ?? "ADMIN");
  const [userName, setUserName] = useState(() => _sessionCache?.userName ?? "");
  const [authenticated, setAuthenticated] = useState(() => _sessionCache !== null);
  const [loading, setLoading] = useState(() => _sessionCache === null);

  useEffect(() => {
    // If already cached from a previous mount, nothing to do.
    if (_sessionCache) {
      setRoleState(_sessionCache.role);
      setUserName(_sessionCache.userName);
      setAuthenticated(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadSession = async () => {
      const session = await fetchSession();
      if (cancelled) return;
      if (!session) {
        setAuthenticated(false);
        setLoading(false);
        const currentPath = typeof window !== "undefined" ? window.location.pathname : "/dashboard";
        if (currentPath !== "/login") {
          router.replace(`/login?next=${encodeURIComponent(currentPath || "/dashboard")}`);
        }
        return;
      }
      setRoleState(session.role);
      setUserName(session.userName);
      setAuthenticated(true);
      setLoading(false);
    };

    void loadSession();
    return () => {
      cancelled = true;
    };
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
      const resolvedRole = payload?.data?.role ?? nextRole;
      // Update module-level cache so subsequent remounts use the new role
      if (_sessionCache) {
        _sessionCache = { ..._sessionCache, role: resolvedRole };
      }
      setRoleState(resolvedRole);
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
