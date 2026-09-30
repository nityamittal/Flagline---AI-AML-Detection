"use server";

import { signIn, signOut } from "@/lib/auth";

// Starting or ending admin sign-in needs no role check: GitHub login and the allow list in
// lib/auth.ts decide who ends up with the ADMIN role.
export async function adminSignIn() {
  await signIn("github", { redirectTo: "/uploads" });
}

export async function adminSignOut() {
  await signOut({ redirectTo: "/" });
}
