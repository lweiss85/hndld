import { Router } from "express";
import { db } from "../db";
import { householdInvites, userProfiles, households } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { requirePermission } from "../middleware/requirePermission";

const router = Router();
const householdContext = householdContextMiddleware;

router.get("/api/invites", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: any, res) => {
  try {
    const householdId = req.householdId!;
    
    const invites = await db
      .select()
      .from(householdInvites)
      .where(eq(householdInvites.householdId, householdId));
    
    res.json(invites);
  } catch (error) {
    console.error("Error fetching invites:", error);
    res.status(500).json({ error: "Failed to fetch invites" });
  }
});

router.post("/api/invites", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const householdId = req.householdId!;
    
    const { email, role } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    const [invite] = await db
      .insert(householdInvites)
      .values({
        householdId,
        email: email.toLowerCase(),
        role: role || "CLIENT",
        token,
        expiresAt,
        createdBy: userId,
      })
      .returning();
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.REPLIT_DEPLOYMENT_URL || "http://localhost:5000";
    
    const inviteLink = `${baseUrl}/join/${token}`;
    
    res.status(201).json({ ...invite, inviteLink });
  } catch (error) {
    console.error("Error creating invite:", error);
    res.status(500).json({ error: "Failed to create invite" });
  }
});

router.post("/api/invites/:token/accept", isAuthenticated, async (req: any, res) => {
  try {
    const { token } = req.params;
    const userId = req.user.claims.sub;
    
    const invites = await db
      .select()
      .from(householdInvites)
      .where(
        and(
          eq(householdInvites.token, token),
          eq(householdInvites.status, "PENDING")
        )
      )
      .limit(1);
    
    if (!invites[0]) {
      return res.status(404).json({ error: "Invalid or expired invite" });
    }
    
    const invite = invites[0];
    
    if (invite.createdBy === userId) {
      return res.status(400).json({ error: "You cannot accept your own invite" });
    }
    
    if (new Date(invite.expiresAt) < new Date()) {
      await db
        .update(householdInvites)
        .set({ status: "EXPIRED" })
        .where(eq(householdInvites.id, invite.id));
      return res.status(400).json({ error: "Invite has expired" });
    }
    
    const existingProfiles = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));
    
    const alreadyInHousehold = existingProfiles.some(p => p.householdId === invite.householdId);
    if (alreadyInHousehold) {
      return res.status(400).json({ error: "You are already a member of this household" });
    }
    
    await db.insert(userProfiles).values({
      userId,
      householdId: invite.householdId,
      role: invite.role,
    });
    
    await db
      .update(householdInvites)
      .set({
        status: "ACCEPTED",
        acceptedBy: userId,
        acceptedAt: new Date(),
      })
      .where(eq(householdInvites.id, invite.id));
    
    res.json({ success: true, householdId: invite.householdId });
  } catch (error) {
    console.error("Error accepting invite:", error);
    res.status(500).json({ error: "Failed to accept invite" });
  }
});

router.get("/api/invites/:token/info", async (req, res) => {
  try {
    const { token } = req.params;
    
    const invites = await db
      .select({
        invite: householdInvites,
        household: households,
      })
      .from(householdInvites)
      .leftJoin(households, eq(householdInvites.householdId, households.id))
      .where(eq(householdInvites.token, token))
      .limit(1);
    
    if (!invites[0]) {
      return res.status(404).json({ error: "Invite not found" });
    }
    
    const { invite, household } = invites[0];
    
    if (invite.status !== "PENDING") {
      return res.status(400).json({ error: `Invite is ${invite.status.toLowerCase()}` });
    }
    
    if (new Date(invite.expiresAt) < new Date()) {
      return res.status(400).json({ error: "Invite has expired" });
    }
    
    res.json({
      householdName: household?.name || "Unknown Household",
      role: invite.role,
      email: invite.email,
      expiresAt: invite.expiresAt,
    });
  } catch (error) {
    console.error("Error getting invite info:", error);
    res.status(500).json({ error: "Failed to get invite info" });
  }
});

router.delete("/api/invites/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: any, res) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    
    const result = await db
      .update(householdInvites)
      .set({ status: "REVOKED" })
      .where(and(
        eq(householdInvites.id, id),
        eq(householdInvites.householdId, householdId)
      ));
    
    res.status(204).send();
  } catch (error) {
    console.error("Error revoking invite:", error);
    res.status(500).json({ error: "Failed to revoke invite" });
  }
});

export default router;
