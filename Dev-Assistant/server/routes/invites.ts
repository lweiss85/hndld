import { Router, Request, NextFunction } from "express";
import { db } from "../db";
import { householdInvites, userProfiles, households } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { requirePermission } from "../middleware/requirePermission";
import { badRequest, notFound, internalError } from "../lib/errors";

const router = Router();
const householdContext = householdContextMiddleware;

/**
 * @openapi
 * /invites:
 *   get:
 *     summary: List household invites
 *     description: Returns all invites for the current household. Requires CAN_MANAGE_SETTINGS permission.
 *     tags:
 *       - Invites
 *     security:
 *       - session: []
 *     parameters:
 *       - $ref: '#/components/parameters/HouseholdHeader'
 *     responses:
 *       200:
 *         description: List of invites for the household
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Invite'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get("/invites", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res, next: NextFunction) => {
  try {
    const householdId = req.householdId!;
    
    const invites = await db
      .select()
      .from(householdInvites)
      .where(eq(householdInvites.householdId, householdId));
    
    res.json(invites);
  } catch (error) {
    console.error("Error fetching invites:", error);
    next(internalError("Failed to fetch invites"));
  }
});

/**
 * @openapi
 * /invites:
 *   post:
 *     summary: Create a household invite
 *     description: Creates a new invite for a user to join the household. Generates a unique invite token and link. Requires CAN_MANAGE_SETTINGS permission.
 *     tags:
 *       - Invites
 *     security:
 *       - session: []
 *     parameters:
 *       - $ref: '#/components/parameters/HouseholdHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address of the person to invite
 *               role:
 *                 type: string
 *                 description: Role to assign to the invited user (defaults to CLIENT)
 *     responses:
 *       201:
 *         description: Invite created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Invite'
 *                 - type: object
 *                   properties:
 *                     inviteLink:
 *                       type: string
 *                       format: uri
 *       400:
 *         description: Email is required
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.post("/invites", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res, next: NextFunction) => {
  try {
    const userId = req.user.claims.sub;
    const householdId = req.householdId!;
    
    const { email, role } = req.body;
    if (!email) {
      throw badRequest("Email is required");
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
    next(internalError("Failed to create invite"));
  }
});

/**
 * @openapi
 * /invites/{token}/accept:
 *   post:
 *     summary: Accept a household invite
 *     description: Accepts a pending invite using the invite token. Adds the authenticated user to the household with the role specified in the invite.
 *     tags:
 *       - Invites
 *     security:
 *       - session: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique invite token
 *     responses:
 *       200:
 *         description: Invite accepted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 householdId:
 *                   type: string
 *       400:
 *         description: Cannot accept own invite, already a member, or invite expired
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Invalid or expired invite
 *       500:
 *         description: Internal server error
 */
router.post("/invites/:token/accept", isAuthenticated, async (req: Request, res, next: NextFunction) => {
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
      throw notFound("Invalid or expired invite");
    }
    
    const invite = invites[0];
    
    if (invite.createdBy === userId) {
      throw badRequest("You cannot accept your own invite");
    }
    
    if (new Date(invite.expiresAt) < new Date()) {
      await db
        .update(householdInvites)
        .set({ status: "EXPIRED" })
        .where(eq(householdInvites.id, invite.id));
      throw badRequest("Invite has expired");
    }
    
    const existingProfiles = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));
    
    const alreadyInHousehold = existingProfiles.some(p => p.householdId === invite.householdId);
    if (alreadyInHousehold) {
      throw badRequest("You are already a member of this household");
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
    next(internalError("Failed to accept invite"));
  }
});

/**
 * @openapi
 * /invites/{token}/info:
 *   get:
 *     summary: Get invite information
 *     description: Returns public information about an invite by its token. Does not require authentication. Used to display invite details before accepting.
 *     tags:
 *       - Invites
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique invite token
 *     responses:
 *       200:
 *         description: Invite information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 householdName:
 *                   type: string
 *                 role:
 *                   type: string
 *                 email:
 *                   type: string
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invite is no longer pending or has expired
 *       404:
 *         description: Invite not found
 *       500:
 *         description: Internal server error
 */
router.get("/invites/:token/info", async (req, res, next: NextFunction) => {
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
      throw notFound("Invite not found");
    }
    
    const { invite, household } = invites[0];
    
    if (invite.status !== "PENDING") {
      throw badRequest(`Invite is ${invite.status.toLowerCase()}`);
    }
    
    if (new Date(invite.expiresAt) < new Date()) {
      throw badRequest("Invite has expired");
    }
    
    res.json({
      householdName: household?.name || "Unknown Household",
      role: invite.role,
      email: invite.email,
      expiresAt: invite.expiresAt,
    });
  } catch (error) {
    console.error("Error getting invite info:", error);
    next(internalError("Failed to get invite info"));
  }
});

/**
 * @openapi
 * /invites/{id}:
 *   delete:
 *     summary: Revoke a household invite
 *     description: Revokes a pending invite by setting its status to REVOKED. Requires CAN_MANAGE_SETTINGS permission.
 *     tags:
 *       - Invites
 *     security:
 *       - session: []
 *     parameters:
 *       - $ref: '#/components/parameters/HouseholdHeader'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The invite ID to revoke
 *     responses:
 *       204:
 *         description: Invite revoked successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.delete("/invites/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res, next: NextFunction) => {
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
    next(internalError("Failed to revoke invite"));
  }
});

export default router;
