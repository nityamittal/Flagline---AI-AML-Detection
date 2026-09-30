import type { Metadata } from "next";
import Link from "next/link";
import { adminSignIn, adminSignOut } from "@/app/auth-actions";
import { authEnabled } from "@/lib/auth-config";
import { getAdmin } from "@/lib/authz";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flagline",
  description: "Review rule-flagged transactions from a synthetic AML dataset.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const admin = await getAdmin();

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <div className="bg-muted text-muted-foreground border-b px-4 py-1.5 text-center text-xs">
          Demo mode: synthetic IBM AML data. Your decisions are only visible to you.
        </div>
        <header className="border-b px-4 py-3">
          <nav className="mx-auto flex w-full max-w-5xl items-center gap-6 text-sm">
            <Link href="/" className="font-semibold">
              Flagline
            </Link>
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              Review queue
            </Link>
            {admin && (
              <Link href="/uploads" className="text-muted-foreground hover:text-foreground">
                Uploads
              </Link>
            )}
          </nav>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
        <footer className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs">
          <span>
            Data: Altman et al., &ldquo;Realistic Synthetic Financial Transactions for Anti-Money
            Laundering Models&rdquo;, NeurIPS 2023.
          </span>
          {admin ? (
            <form action={adminSignOut} className="flex items-center gap-2">
              <span>Signed in as {admin.githubLogin}</span>
              <button type="submit" className="underline underline-offset-4">
                Sign out
              </button>
            </form>
          ) : authEnabled() ? (
            <form action={adminSignIn}>
              <button type="submit" className="underline underline-offset-4">
                Admin sign-in
              </button>
            </form>
          ) : null}
        </footer>
      </body>
    </html>
  );
}
