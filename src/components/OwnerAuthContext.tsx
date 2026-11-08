"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

interface OwnerContextType {
  isOwner: boolean;
  showDemoPasscode: boolean;
  demoPasscode?: string;
  isLoading: boolean;
  login: (passcode: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

const OwnerContext = createContext<OwnerContextType>({
  isOwner: false,
  showDemoPasscode: false,
  isLoading: true,
  login: async () => ({ success: false }),
  logout: async () => {},
  checkSession: async () => {},
});

export const OwnerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [showDemoPasscode, setShowDemoPasscode] = useState<boolean>(false);
  const [demoPasscode, setDemoPasscode] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const checkSession = useCallback(async () => {
    try {
      const [meRes, configRes] = await Promise.all([
        fetch("/api/owner/me", { cache: "no-store" }),
        fetch("/api/config", { cache: "no-store" }),
      ]);

      if (meRes.ok) {
        const meData = await meRes.json();
        setIsOwner(Boolean(meData.owner));
      }

      if (configRes.ok) {
        const configData = await configRes.json();
        setShowDemoPasscode(Boolean(configData.showDemoPasscode));
        if (configData.demoPasscode) {
          setDemoPasscode(configData.demoPasscode);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const run = async () => {
      try {
        const [meRes, configRes] = await Promise.all([
          fetch("/api/owner/me", { cache: "no-store" }),
          fetch("/api/config", { cache: "no-store" }),
        ]);

        if (isCancelled) return;

        if (meRes.ok) {
          const meData = await meRes.json();
          setIsOwner(Boolean(meData.owner));
        }

        if (configRes.ok) {
          const configData = await configRes.json();
          setShowDemoPasscode(Boolean(configData.showDemoPasscode));
          if (configData.demoPasscode) {
            setDemoPasscode(configData.demoPasscode);
          }
        }
      } catch {
        // ignore
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    run();

    return () => {
      isCancelled = true;
    };
  }, []);

  const login = async (passcode: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return { success: false, error: data.error || "Login failed" };
      }

      setIsOwner(true);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Network error occurred",
      };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await fetch("/api/owner/logout", { method: "POST" });
    } catch {
      // ignore
    } finally {
      setIsOwner(false);
    }
  };

  return (
    <OwnerContext.Provider
      value={{
        isOwner,
        showDemoPasscode,
        demoPasscode,
        isLoading,
        login,
        logout,
        checkSession,
      }}
    >
      {children}
    </OwnerContext.Provider>
  );
};

export function useOwner(): OwnerContextType {
  return useContext(OwnerContext);
}
