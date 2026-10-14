"use client";

import React from "react";
import { useLeashData } from "@/components/useLeashData";
import { Header } from "@/components/Header";
import { RequestBox } from "@/components/RequestBox";
import { ApprovalInbox } from "@/components/ApprovalInbox";
import { RulesPanel } from "@/components/RulesPanel";
import { Ledger } from "@/components/Ledger";

export default function Home() {
  const {
    actions,
    spentToday,
    rules,
    demoMode,
    isLoading,
    refresh,
  } = useLeashData();

  const pendingActions = actions.filter((a) => a.status === "pending_approval");
  const dailyCap = rules?.dailyCap ?? 1000;

  return (
    <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)] flex flex-col">
      <Header
        spentToday={spentToday}
        dailyCap={dailyCap}
        pendingCount={pendingActions.length}
        demoMode={demoMode}
        onResetComplete={refresh}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {isLoading && actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--color-ink-muted)]">
            <p className="text-sm">Connecting to Leash Engine...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            {/* Left column (8 cols): RequestBox, then "Needs you" queue (ApprovalInbox), then Ledger */}
            <div className="lg:col-span-8 flex flex-col gap-6 w-full">
              <RequestBox onRequestComplete={refresh} />
              <ApprovalInbox pendingActions={pendingActions} onActionHandled={refresh} />
              <Ledger actions={actions} onRefresh={refresh} />
            </div>

            {/* Right column (4 cols): RulesPanel (sticky on wide screens) */}
            <div className="lg:col-span-4 w-full lg:sticky lg:top-20">
              <RulesPanel
                key={
                  rules
                    ? `${rules.autoApproveLimit}-${rules.hardLimit}-${rules.dailyCap}-${rules.allowedRecipients.length}-${rules.blockedActionTypes.length}`
                    : "empty"
                }
                rules={rules}
                onRulesSaved={refresh}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
