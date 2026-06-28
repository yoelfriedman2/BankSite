import { redirect } from "next/navigation";

// Activity moved into the combined Updates page (What's New + Activity tabs).
export default function ActivityPage() {
  redirect("/updates");
}
