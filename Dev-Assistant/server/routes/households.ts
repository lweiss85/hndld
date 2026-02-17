import { Router, NextFunction } from "express";
import { storage } from "../storage";
import { forbidden, internalError } from "../lib/errors";

const router = Router();

/**
 * @openapi
 * /households/mine:
 *   get:
 *     summary: Get current user's households
 *     description: Returns all households the authenticated user belongs to, including their role and default status.
 *     tags:
 *       - Households
 *     security:
 *       - session: []
 *     responses:
 *       200:
 *         description: List of households for the current user
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   organizationId:
 *                     type: string
 *                   userRole:
 *                     type: string
 *                   isDefault:
 *                     type: boolean
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/mine", async (req: any, res, next: NextFunction) => {
  try {
    const userId = req.user.claims.sub;
    
    const userHouseholds = await storage.getUserHouseholds(userId);
    
    res.json(userHouseholds.map(h => ({
      id: h.id,
      name: h.name,
      organizationId: h.organizationId,
      userRole: h.role,
      isDefault: h.isDefault,
    })));
  } catch (error) {
    console.error("Error fetching user households:", error);
    next(internalError("Failed to fetch households"));
  }
});

/**
 * @openapi
 * /households/set-default:
 *   post:
 *     summary: Set default household
 *     description: Sets the specified household as the default for the authenticated user.
 *     tags:
 *       - Households
 *     security:
 *       - session: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - householdId
 *             properties:
 *               householdId:
 *                 type: string
 *                 description: ID of the household to set as default
 *     responses:
 *       200:
 *         description: Default household updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 defaultHouseholdId:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied to this household
 *       500:
 *         description: Internal server error
 */
router.post("/set-default", async (req: any, res, next: NextFunction) => {
  try {
    const { householdId } = req.body;
    const userId = req.user.claims.sub;
    
    const userHouseholds = await storage.getUserHouseholds(userId);
    const hasAccess = userHouseholds.some(h => h.id === householdId);
    
    if (!hasAccess) {
      throw forbidden("Access denied to this household");
    }
    
    await storage.setDefaultHousehold(userId, householdId);
    
    res.json({ success: true, defaultHouseholdId: householdId });
  } catch (error) {
    console.error("Error setting default household:", error);
    next(internalError("Failed to set default household"));
  }
});

export default router;
