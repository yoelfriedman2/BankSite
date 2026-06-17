"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE, setDemoProfile } from "@/lib/demo";

export async function updateSettings(values: {
  display_name: string;
  default_dormancy_months: string;
  holders: string[];
  notify_email: boolean;
  activity_reminder_months: number[];
  notify_new_comments: boolean;
  notify_product_updates: boolean;
}): Promise<{ error?: string }> {
  const months = parseInt(values.default_dormancy_months, 10);
  if (!Number.isFinite(months) || months < 1) {
    return { error: "Default dormancy window must be at least 1 month." };
  }
  const displayName = values.display_name.trim() || null;
  const holders = Array.from(
    new Set((values.holders ?? []).map((h) => h.trim()).filter(Boolean)),
  );
  const reminderMonths = (values.activity_reminder_months ?? [])
    .filter((n) => Number.isFinite(n) && n >= 1)
    .sort((a, b) => a - b);

  if (DEMO_MODE) {
    setDemoProfile({
      display_name: displayName,
      default_dormancy_months: months,
      holders,
      notify_email: values.notify_email,
      activity_reminder_months: reminderMonths,
      notify_new_comments: values.notify_new_comments,
      notify_product_updates: values.notify_product_updates,
    });
    revalidatePath("/settings");
    revalidatePath("/banks");
    revalidatePath("/accounts");
    revalidatePath("/");
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      default_dormancy_months: months,
      holders,
      notify_email: values.notify_email,
      activity_reminder_months: reminderMonths,
      notify_new_comments: values.notify_new_comments,
      notify_product_updates: values.notify_product_updates,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/banks");
  revalidatePath("/accounts");
  revalidatePath("/");
  return {};
}
