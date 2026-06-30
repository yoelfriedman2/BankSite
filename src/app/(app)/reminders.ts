"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DEMO_MODE } from "@/lib/demo";
import type { Reminder } from "@/lib/types";

function revalidate() {
  revalidatePath("/banks");
  revalidatePath("/");
}

export async function getReminders(bankId: string): Promise<Reminder[]> {
  if (DEMO_MODE) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("reminders")
    .select("*")
    .eq("bank_id", bankId)
    .order("due_date", { ascending: true });
  return (data ?? []) as Reminder[];
}

export async function addReminder(
  bankId: string,
  note: string,
  dueDate: string,
): Promise<{ error?: string }> {
  const text = note.trim();
  if (!text) return { error: "Add a note." };
  if (!dueDate) return { error: "Pick a date." };
  if (DEMO_MODE) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { error } = await supabase
    .from("reminders")
    .insert({ user_id: user.id, bank_id: bankId, note: text, due_date: dueDate });
  if (error) return { error: error.message };

  revalidate();
  return {};
}

export async function toggleReminderDone(
  id: string,
  done: boolean,
): Promise<{ error?: string }> {
  if (DEMO_MODE) return {};
  const supabase = await createClient();
  // RLS restricts this to the reminder's owner.
  const { error } = await supabase
    .from("reminders")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return {};
}

export async function deleteReminder(id: string): Promise<{ error?: string }> {
  if (DEMO_MODE) return {};
  const supabase = await createClient();
  const { error } = await supabase.from("reminders").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return {};
}
