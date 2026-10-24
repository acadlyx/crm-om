import { redirect } from "next/navigation";

// Keep the conventional login URL from exposing the sign-in form.
export default function LegacyLoginPage() {
  redirect("/");
}
