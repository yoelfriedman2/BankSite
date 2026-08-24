/**
 * Saved "From" blocks (name + return address) a letter can be signed as.
 *
 * Accounts in this app often belong to different family members, so this is
 * a small set of named profiles rather than one single value — see
 * SendClient.tsx's "Signing as" picker, which owns the UI for adding,
 * renaming, and deleting them. This module is the shared read/match logic
 * underneath it, so anything else that needs to print a letter (e.g. Address
 * Change's "Print all remaining") can resolve the right signer for a given
 * account holder without duplicating the localStorage keys or the migration
 * of the old single "bt_send_from" value.
 *
 * Kept entirely in the browser's localStorage, like the single value it
 * replaces — this is convenience text, not sensitive data.
 */

export interface SignerProfile {
  id: string;
  label: string;
  text: string;
}

const PROFILES_KEY = "bt_send_profiles";
const ACTIVE_PROFILE_KEY = "bt_send_profile_id";
const LEGACY_FROM_KEY = "bt_send_from";

/** Reads every saved profile. Migrates the old single "bt_send_from" value
 *  into one profile (in the returned list only) if nothing's been saved
 *  under the new key yet — callers that want that migration to stick
 *  (SendClient.tsx) persist it themselves via saveSignerProfiles. */
export function loadSignerProfiles(): SignerProfile[] {
  let list: SignerProfile[] = [];
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) list = parsed as SignerProfile[];
  } catch {
    /* storage blocked or corrupt — fall through to migration below */
  }
  if (list.length === 0) {
    let legacy = "";
    try {
      legacy = localStorage.getItem(LEGACY_FROM_KEY) ?? "";
    } catch {
      /* storage blocked */
    }
    list = [{ id: "default", label: legacy.split("\n")[0]?.trim() || "Me", text: legacy }];
  }
  return list;
}

/** Which profile was last active, or the first one if that's unset/stale. */
export function loadActiveProfileId(profiles: SignerProfile[]): string | null {
  try {
    const saved = localStorage.getItem(ACTIVE_PROFILE_KEY);
    if (saved && profiles.some((p) => p.id === saved)) return saved;
  } catch {
    /* storage blocked */
  }
  return profiles[0]?.id ?? null;
}

export function saveSignerProfiles(profiles: SignerProfile[]): void {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    /* storage blocked */
  }
}

export function saveActiveProfileId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  } catch {
    /* storage blocked */
  }
}

/** Case-insensitive match against a saved profile's label — e.g. an account
 *  holder's name lining up with a signer someone already saved for
 *  themselves. Returns undefined (not a fallback profile) so callers decide
 *  what "no match" should default to. */
export function findSignerProfileByLabel(
  profiles: SignerProfile[],
  label: string,
): SignerProfile | undefined {
  const target = label.trim().toLowerCase();
  if (!target) return undefined;
  return profiles.find((p) => p.label.trim().toLowerCase() === target);
}
