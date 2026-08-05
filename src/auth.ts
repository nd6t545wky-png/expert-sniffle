import { betterAuth } from "better-auth";
import { passkey } from "@better-auth/passkey";
import type { Env } from "./env";

export function createAuth(env: Env, origin: string) {
  const hostname = new URL(origin).hostname;
  return betterAuth({
    appName: "Pitching OS",
    database: env.SYNC_DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    basePath: "/api/auth",
    trustedOrigins: [origin],
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: "select_account",
      },
    },
    account: {
      updateAccountOnSignIn: false,
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      cookiePrefix: "pitching_os",
      defaultCookieAttributes: {
        httpOnly: true,
        secure: origin.startsWith("https://"),
        sameSite: "lax",
        path: "/",
      },
    },
    plugins: [
      passkey({
        rpID: hostname,
        rpName: "Pitching OS",
        origin,
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "required",
        },
      }),
    ],
  });
}
