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
    <div className="min-h-screen bg-[#0b0d11] text-zinc-100 flex flex-col">
      <Header
        spentToday={spentToday}
        dailyCap={dailyCap}
        pendingCount={pendingActions.length}
        demoMode={demoMode}
        onResetComplete={refresh}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {isLoading && actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <svg className="w-8 h-8 animate-spin text-indigo-500 mb-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm font-medium">Connecting to Leash Engine...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            {/* Left Column (8 cols): RequestBox, ApprovalInbox, Ledger */}
            <div className="lg:col-span-8 flex flex-col gap-6 w-full">
              <RequestBox onRequestComplete={refresh} />
              <ApprovalInbox pendingActions={pendingActions} onActionHandled={refresh} />
              <Ledger actions={actions} onRefresh={refresh} />
            </div>

            {/* Right Column (4 cols): RulesPanel */}
            <div className="lg:col-span-4 w-full sticky top-20">
              <RulesPanel
                key={rules ? `${rules.autoApproveLimit}-${rules.hardLimit}-${rules.dailyCap}-${rules.allowedRecipients.length}-${rules.blockedActionTypes.length}` : "empty"}
                rules={rules}
                onRulesSaved={refresh}
              />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-800/60 py-4 text-center text-xs text-zinc-600">
        Leash • Autonomous Financial Agent • PayPal Sandbox Policy Enforcer
      </footer>
    </div>
  );
}
