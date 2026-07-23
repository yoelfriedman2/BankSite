"use client";

import { useEffect, useState } from "react";
import { CHANGELOG_LATEST } from "@/lib/changelog";

const BASE_KEY = "bt_changelog_seen";

/** True when there's a changelog entry the user hasn't seen yet. Scoped per
 *  user (same convention as WalkthroughModal's own storage key) — this is a
 *  family/shared-device app, and an unscoped key meant one person opening
 *  Updates silently marked it "seen" for whoever signs in next on the same
 *  browser profile. */
export function useChangelogUnread(userId: string): boolean {
  // Storage being blocked/unavailable means we genuinely don't know whether
  // the user has seen the latest update — default to showing the indicator
  // rather than silently hiding a real update notice. This isn't a security
  // control, just a "did you see this" dot, so erring toward showing it is
  // the safer failure mode.
  const [unread, setUnread] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const key = `${BASE_KEY}_${userId}`;
    const check = () => {
      try {
        setUnread(localStorage.getItem(key) !== CHANGELOG_LATEST);
      } catch {
        setUnread(true);
      }
    };
    check();
    window.addEventListener("changelog-seen", check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener("changelog-seen", check);
      window.removeEventListener("storage", check);
    };
  }, [userId]);

  return unread;
}

/** Marks the latest changelog as seen (for this user) and clears the unread
 *  dot live. */
export function markChangelogSeen(userId: string) {
  if (!userId) return;
  try {
    localStorage.setItem(`${BASE_KEY}_${userId}`, CHANGELOG_LATEST);
    window.dispatchEvent(new Event("changelog-seen"));
  } catch {
    /* storage blocked */
  }
}
