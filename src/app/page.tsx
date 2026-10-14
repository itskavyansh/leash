"use client";

import React, { useState } from "react";
import { useLeashData } from "@/components/useLeashData";
import { Header } from "@/components/Header";
import { RequestBox, ActionResultSummary } from "@/components/RequestBox";
import { ActivityFeed } from "@/components/ActivityFeed";
import { SpendingGauge } from "@/components/SpendingGauge";
import { WhereItLandsPanel } from "@/components/WhereItLandsPanel";
import { RulesPanel } from "@/components/RulesPanel";

export default function Home() {
  const {
    actions,
    spentToday,
    rules,
    demoMode,
    isLoading,
    refresh,
  } = useLeashData();

  // Allowed logic change: piece of page-level state so the ruler can show the last request amount
  const [lastActionResult, setLastActionResult] = useState<ActionResultSummary | null>(null);

  const pendingActions = actions.filter((a) => a.status === "pending_approval");
  const dailyCap = rules?.dailyCap ?? 1000;
  const autoApproveLimit = rules?.autoApproveLimit ?? 200;
  const hardLimit = rules?.hardLimit ?? 5000;

  return (
    <div className="min-h-screen bg-[var(--color-page)] text-[var(--color-ink)] flex flex-col">
      <main className="flex-1 max-w-[1320px] w-full mx-auto px-6 lg:px-8 py-6">
        <Header demoMode={demoMode} onResetComplete={refresh} />

        {isLoading && actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--color-ink-muted)]">
            <p className="text-sm">Connecting to Leash Engine...</p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row items-start gap-5 w-full">
            {/* Left column (flexible): RequestBox, then ActivityFeed (Pending band + Ledger) */}
            <div className="flex-1 w-full flex flex-col gap-4 min-w-0">
              <RequestBox
                onRequestComplete={refresh}
                onResult={setLastActionResult}
              />
              <ActivityFeed
                actions={actions}
                pendingActions={pendingActions}
                onActionHandled={refresh}
                onRefresh={refresh}
              />
            </div>

            {/* Right column (330px fixed, three white panels): SpendingGauge, WhereItLandsPanel, RulesPanel */}
            <div className="w-full lg:w-[330px] shrink-0 flex flex-col gap-4">
              <SpendingGauge spentToday={spentToday} dailyCap={dailyCap} />
              <WhereItLandsPanel
                autoApproveLimit={autoApproveLimit}
                hardLimit={hardLimit}
                lastAmount={lastActionResult?.amount}
              />
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
