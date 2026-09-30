import NextAuth, { type DefaultSession } from "next-auth";
import GitHub, { type GitHubProfile } from "next-auth/providers/github";
import { githubIdOf, isAdminLogin } from "@/lib/admin-list";
import { db } from "@/lib/db";

declare module "next-auth" {
  interface Session {
    user: { id?: string; role?: "ADMIN"; login?: string } & DefaultSession["user"];
  }
}

// next-auth/jwt only re-exports this module, so the JWT interface is augmented at its source.
declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    role?: "ADMIN";
    login?: string;
  }
}

// Admin sign-in only. Visitors never sign in; they get a guest session from proxy.ts.
// Reads AUTH_SECRET, AUTH_GITHUB_ID and AUTH_GITHUB_SECRET from the environment.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  session: { strategy: "jwt" },
  callbacks: {
    // Only allow-listed GitHub users get an admin session. Everyone else is sent back
    // to the queue as a guest with a note, instead of Auth.js's error page.
    signIn({ account, profile }) {
      if (account?.provider !== "github" || !githubIdOf(profile)) return false;
      const login = (profile as GitHubProfile | undefined)?.login;
      return isAdminLogin(login) ? true : "/?notice=not-admin";
    },
    // `account` and `profile` are only present on the sign-in request itself. The user row is
    // matched on the GitHub account id; the login is refreshed on each sign-in.
    async jwt({ token, account, profile }) {
      const githubId = githubIdOf(profile);
      if (account?.provider === "github" && githubId) {
        const { login } = profile as unknown as GitHubProfile;
        const user = await db.user.upsert({
          where: { githubId },
          create: { githubId, githubLogin: login, role: "ADMIN" },
          update: { githubLogin: login },
        });
        await db.auditLog.create({
          data: {
            actorType: "ADMIN",
            actorId: user.id,
            action: "admin.sign_in",
            entityType: "User",
            entityId: user.id,
            metadata: { githubLogin: login },
          },
        });
        token.uid = user.id;
        token.role = "ADMIN";
        token.login = login;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid;
      session.user.role = token.role;
      session.user.login = token.login;
      return session;
    },
  },
});
