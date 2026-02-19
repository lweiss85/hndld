import { Router, Request, Response } from "express";
import { db } from "../db";
import { oauthClients, oauthAuthorizationCodes, apiTokens } from "@shared/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
import { addMinutes, addDays } from "date-fns";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import crypto from "crypto";
import bcrypt from "bcrypt";
import logger from "../lib/logger";

const router = Router();

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

router.get("/oauth/authorize", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const { client_id, redirect_uri, response_type, state, scope } = req.query;

    if (response_type !== "code") {
      return res.status(400).json({ error: "unsupported_response_type" });
    }

    const [client] = await db.select().from(oauthClients)
      .where(and(
        eq(oauthClients.clientId, client_id as string),
        eq(oauthClients.isActive, true)
      )).limit(1);

    if (!client) {
      return res.status(400).json({ error: "invalid_client" });
    }

    if (!client.redirectUris.includes(redirect_uri as string)) {
      return res.status(400).json({ error: "invalid_redirect_uri" });
    }

    const safeName = escapeHtml(client.name);
    const safeClientId = escapeHtml(client_id as string);
    const safeRedirectUri = escapeHtml(redirect_uri as string);
    const safeState = escapeHtml((state as string) || "");
    const safeScope = escapeHtml((scope as string) || "default");

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authorize ${safeName}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; background: #F6F2EA; color: #1D2A44; }
            h1 { font-size: 24px; font-weight: 600; }
            ul { line-height: 1.8; }
            button { padding: 12px 24px; font-size: 16px; margin: 10px 5px 10px 0; cursor: pointer; border-radius: 8px; }
            .allow { background: #1D2A44; color: white; border: none; }
            .allow:hover { background: #2a3d5c; }
            .deny { background: #eee; border: 1px solid #ccc; color: #333; }
            .deny:hover { background: #ddd; }
          </style>
        </head>
        <body>
          <h1>Allow ${safeName} to access hndld?</h1>
          <p>${safeName} wants to:</p>
          <ul>
            <li>View your household information</li>
            <li>Check your cleaning schedule</li>
            <li>Manage approvals</li>
            <li>Control smart locks</li>
          </ul>
          <form method="POST" action="/api/v1/oauth/authorize">
            <input type="hidden" name="client_id" value="${safeClientId}" />
            <input type="hidden" name="redirect_uri" value="${safeRedirectUri}" />
            <input type="hidden" name="state" value="${safeState}" />
            <input type="hidden" name="scope" value="${safeScope}" />
            <button type="submit" name="action" value="allow" class="allow">Allow</button>
            <button type="submit" name="action" value="deny" class="deny">Deny</button>
          </form>
        </body>
      </html>
    `);
  } catch (error) {
    logger.error("OAuth authorize error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/oauth/authorize", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const { client_id, redirect_uri, state, scope, action } = req.body;
    const userId = (req as any).user!.claims.sub;
    const householdId = (req as any).householdId!;

    const [client] = await db.select().from(oauthClients)
      .where(and(
        eq(oauthClients.clientId, client_id as string),
        eq(oauthClients.isActive, true)
      )).limit(1);

    if (!client) {
      return res.status(400).json({ error: "invalid_client" });
    }

    if (!client.redirectUris.includes(redirect_uri as string)) {
      return res.status(400).json({ error: "invalid_redirect_uri" });
    }

    if (action === "deny") {
      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set("error", "access_denied");
      if (state) redirectUrl.searchParams.set("state", state);
      return res.redirect(redirectUrl.toString());
    }

    const code = crypto.randomBytes(32).toString("hex");
    const expiresAt = addMinutes(new Date(), 10);

    await db.insert(oauthAuthorizationCodes).values({
      code,
      clientId: client_id,
      userId,
      householdId,
      redirectUri: redirect_uri,
      scope,
      expiresAt,
    });

    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);

    res.redirect(redirectUrl.toString());
  } catch (error) {
    logger.error("OAuth authorize POST error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/oauth/token", async (req: Request, res: Response) => {
  try {
    const { grant_type, code, redirect_uri, client_id, client_secret } = req.body;

    if (grant_type !== "authorization_code") {
      return res.status(400).json({ error: "unsupported_grant_type" });
    }

    const [client] = await db.select().from(oauthClients)
      .where(and(
        eq(oauthClients.clientId, client_id),
        eq(oauthClients.isActive, true)
      )).limit(1);

    if (!client) {
      return res.status(400).json({ error: "invalid_client" });
    }

    const secretValid = await bcrypt.compare(client_secret, client.clientSecret);
    if (!secretValid) {
      return res.status(400).json({ error: "invalid_client" });
    }

    const [authCode] = await db.select().from(oauthAuthorizationCodes)
      .where(and(
        eq(oauthAuthorizationCodes.code, code),
        eq(oauthAuthorizationCodes.clientId, client_id),
        gt(oauthAuthorizationCodes.expiresAt, new Date()),
        isNull(oauthAuthorizationCodes.usedAt)
      )).limit(1);

    if (!authCode) {
      return res.status(400).json({ error: "invalid_grant" });
    }

    if (authCode.redirectUri !== redirect_uri) {
      return res.status(400).json({ error: "invalid_grant" });
    }

    await db.update(oauthAuthorizationCodes)
      .set({ usedAt: new Date() })
      .where(eq(oauthAuthorizationCodes.id, authCode.id));

    const accessToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = addDays(new Date(), 365);

    await db.insert(apiTokens).values({
      userId: authCode.userId,
      householdId: authCode.householdId,
      token: accessToken,
      name: client.name,
      expiresAt,
    });

    res.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 31536000,
    });
  } catch (error) {
    logger.error("OAuth token error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "server_error" });
  }
});

export function registerOAuthRoutes(app: Router) {
  app.use(router);
}
