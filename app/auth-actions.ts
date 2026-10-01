"use server";

import { redirect } from "next/navigation";
import { signIn, signOut } from "@/lib/auth";
import { authEnabled } from "@/lib/auth-config";

// Starting or ending admin sign-in needs no role check: GitHub login and the allow list in
// lib/auth.ts decide who ends up with the ADMIN role. Without sign-in configured, both are no-ops.
export async function adminSignIn() {
  if (!authEnabled()) redirect("/");
  await signIn("github", { redirectTo: "/uploads" });
}

export async function adminSignOut() {
  if (!authEnabled()) redirect("/");
  await signOut({ redirectTo: "/" });
}
