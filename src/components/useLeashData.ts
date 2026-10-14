import { useState, useEffect, useCallback, useRef } from "react";
import type { Rules, StoredAction } from "@/lib/types";

export interface ActionsResponse {
  actions: StoredAction[];
  spentToday: number;
}

export interface UseLeashDataReturn {
  actions: StoredAction[];
  spentToday: number;
  rules: Rules | null;
  demoMode: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useLeashData(): UseLeashDataReturn {
  const [actions, setActions] = useState<StoredAction[]>([]);
  const [spentToday, setSpentToday] = useState<number>(0);
  const [rules, setRules] = useState<Rules | null>(null);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  const fetchActions = useCallback(async () => {
    try {
      const res = await fetch("/api/actions", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to fetch actions: ${res.statusText}`);
      }
      const data: ActionsResponse = await res.json();
      if (isMountedRef.current) {
        setActions(data.actions ?? []);
        setSpentToday(data.spentToday ?? 0);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Error fetching actions");
      }
    }
  }, []);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/rules", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to fetch rules: ${res.statusText}`);
      }
      const data: Rules = await res.json();
      if (isMountedRef.current) {
        setRules(data);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Error fetching rules");
      }
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config", { cache: "no-store" });
      if (res.ok) {
        const data: { demoMode: boolean } = await res.json();
        if (isMountedRef.current) {
          setDemoMode(Boolean(data.demoMode));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([fetchActions(), fetchRules(), fetchConfig()]);
  }, [fetchActions, fetchRules, fetchConfig]);

  // Initial load
  useEffect(() => {
    isMountedRef.current = true;
    (async () => {
      setIsLoading(true);
      await refresh();
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    })();

    return () => {
      isMountedRef.current = false;
    };
  }, [refresh]);

  // Polling every 4 seconds when tab is visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      fetchActions();
    }, 4000);

    return () => clearInterval(interval);
  }, [fetchActions]);

  return {
    actions,
    spentToday,
    rules,
    demoMode,
    isLoading,
    error,
    refresh,
  };
}
