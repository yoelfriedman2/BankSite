"use client";

import { useEffect, useState } from "react";
import { CHANGELOG_LATEST } from "@/lib/changelog";

const KEY = "bt_changelog_seen";

/** True when there's a changelog entry the user hasn't seen yet. */
export function useChangelogUnread(): boolean {
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    const check = () => {
      try {
        setUnread(localStorage.getItem(KEY) !== CHANGELOG_LATEST);
      } catch {
        /* storage blocked */
      }
    };
    check();
    window.addEventListener("changelog-seen", check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener("changelog-seen", check);
      window.removeEventListener("storage", check);
    };
  }, []);

  return unread;
}

/** Marks the latest changelog as seen and clears the unread dot live. */
export function markChangelogSeen() {
  try {
    localStorage.setItem(KEY, CHANGELOG_LATEST);
    window.dispatchEvent(new Event("changelog-seen"));
  } catch {
    /* storage blocked */
  }
}
