"use client";

import { ChevronLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

const HIDDEN_PATHS = new Set<string>(["/", "/dashboard"]);

export function UnifiedBackButton() {
  const router = useRouter();
  const pathname = usePathname();

  if (HIDDEN_PATHS.has(pathname)) return null;

  const onBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard");
  };

  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="返回上一页"
      className="fixed bottom-5 right-5 z-50 inline-flex h-11 items-center gap-1.5 rounded-full bg-slate-700 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-slate-600 md:bottom-auto md:right-8 md:top-24"
    >
      <ChevronLeft className="h-4 w-4" />
      返回
    </button>
  );
}
