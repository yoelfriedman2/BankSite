-- The welcome walkthrough tracked "have you seen this" only in the browser's
-- localStorage, keyed per-device. That meant switching devices (or a browser
-- clearing storage) made the tour "forget" and pop back up, even for someone
-- who'd already dismissed it elsewhere. Moves the flag onto the account
-- itself so it's genuinely tied to the user, not the browser.
--
-- Stores the tour's own version tag (e.g. "bt_tour_v2", see
-- WalkthroughModal.tsx's TOUR_VERSION) rather than a plain boolean, so a
-- future redesign of the tour can bump the version and have it show once
-- more for everyone, the same way the component's old localStorage key
-- already did.
alter table public.profiles
  add column if not exists walkthrough_tour_seen text;
