"use client";

import React from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { NavigationShell, type NavUser } from "./NavigationShell";
import { type BranchInfo } from "./BranchSwitcher";
import { type NotificationCounts } from "./NotificationBell";

export function AppShellWrapper({
  user,
  currentBranchId,
  branches,
  notificationCounts,
  children,
}: {
  user: NavUser;
  currentBranchId: string;
  branches: BranchInfo[];
  notificationCounts: NotificationCounts;
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <NavigationShell
        user={user}
        currentBranchId={currentBranchId}
        branches={branches}
        notificationCounts={notificationCounts}
      >
        {children}
      </NavigationShell>
    </ToastProvider>
  );
}

