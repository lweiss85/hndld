import type { Request, Response } from "express";
import type { Router } from "express";
import { storage } from "../storage";
import logger from "../lib/logger";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";

const householdContext = householdContextMiddleware;

export async function registerCleaningRoutes(app: Router): Promise<void> {
  // ============================================
  // CLEANING SERVICE ENDPOINTS
  // ============================================

  /**
   * @openapi
   * /addon-services:
   *   get:
   *     tags: [Addon Services]
   *     summary: List add-on services
   *     description: Returns all add-on services for the household
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: List of add-on services
   *       500:
   *         description: Server error
   */
  app.get("/addon-services", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const addons = await storage.getAddonServices(householdId);
      res.json(addons);
    } catch (error) {
      logger.error("Error fetching addon services", { error, householdId });
      res.status(500).json({ message: "Failed to fetch addon services" });
    }
  });

  /**
   * @openapi
   * /addon-services:
   *   post:
   *     tags: [Addon Services]
   *     summary: Create an add-on service
   *     description: Creates a new add-on service for the household (assistants only)
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
   *             required: [name, priceInCents]
   *             properties:
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *               priceInCents:
   *                 type: integer
   *               estimatedMinutes:
   *                 type: integer
   *               category:
   *                 type: string
   *               sortOrder:
   *                 type: integer
   *     responses:
   *       201:
   *         description: Add-on service created
   *       400:
   *         description: Invalid input
   *       403:
   *         description: Not an assistant
   *       500:
   *         description: Server error
   */
  app.post("/addon-services", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const userProfile = req.userProfile;
      
      if (userProfile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage add-on services" });
      }
      
      const { name, description, priceInCents, estimatedMinutes, category, sortOrder } = req.body;
      
      if (!name || priceInCents === undefined) {
        return res.status(400).json({ message: "Name and price are required" });
      }
      
      const parsedPrice = parseInt(priceInCents, 10);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: "Price must be a valid positive number" });
      }
      
      const addon = await storage.createAddonService({
        householdId,
        name,
        description,
        priceInCents: parsedPrice,
        estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes, 10) : undefined,
        category,
        sortOrder: sortOrder ? parseInt(sortOrder, 10) : 0,
        isActive: true,
      });
      
      res.status(201).json(addon);
    } catch (error) {
      logger.error("Error creating addon service", { error, householdId });
      res.status(500).json({ message: "Failed to create addon service" });
    }
  });

  /**
   * @openapi
   * /addon-services/{id}:
   *   patch:
   *     tags: [Addon Services]
   *     summary: Update an add-on service
   *     description: Updates an existing add-on service (assistants only)
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *               priceInCents:
   *                 type: integer
   *               estimatedMinutes:
   *                 type: integer
   *               category:
   *                 type: string
   *               sortOrder:
   *                 type: integer
   *               isActive:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Add-on service updated
   *       400:
   *         description: Invalid price
   *       403:
   *         description: Not an assistant
   *       404:
   *         description: Add-on service not found
   *       500:
   *         description: Server error
   */
  app.patch("/addon-services/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userProfile = req.userProfile;
      const householdId = req.householdId!;
      
      if (userProfile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage add-on services" });
      }
      
      const existing = await storage.getAddonServiceById(id);
      if (!existing || existing.householdId !== householdId) {
        return res.status(404).json({ message: "Add-on service not found" });
      }
      
      const { name, description, priceInCents, estimatedMinutes, category, sortOrder, isActive } = req.body;
      
      if (priceInCents !== undefined) {
        const parsedPrice = parseInt(priceInCents, 10);
        if (isNaN(parsedPrice) || parsedPrice < 0) {
          return res.status(400).json({ message: "Price must be a valid positive number" });
        }
      }
      
      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (priceInCents !== undefined) updateData.priceInCents = parseInt(priceInCents, 10);
      if (estimatedMinutes !== undefined) updateData.estimatedMinutes = parseInt(estimatedMinutes, 10);
      if (category !== undefined) updateData.category = category;
      if (sortOrder !== undefined) updateData.sortOrder = parseInt(sortOrder, 10);
      if (isActive !== undefined) updateData.isActive = isActive;
      
      const addon = await storage.updateAddonService(id, updateData);
      res.json(addon);
    } catch (error) {
      logger.error("Error updating addon service", { error, householdId, id });
      res.status(500).json({ message: "Failed to update addon service" });
    }
  });

  /**
   * @openapi
   * /addon-services/{id}:
   *   delete:
   *     tags: [Addon Services]
   *     summary: Delete an add-on service
   *     description: Deletes an add-on service from the household (assistants only)
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Add-on service deleted
   *       403:
   *         description: Not an assistant
   *       404:
   *         description: Add-on service not found
   *       500:
   *         description: Server error
   */
  app.delete("/addon-services/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userProfile = req.userProfile;
      const householdId = req.householdId!;
      
      if (userProfile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage add-on services" });
      }
      
      const existing = await storage.getAddonServiceById(id);
      if (!existing || existing.householdId !== householdId) {
        return res.status(404).json({ message: "Add-on service not found" });
      }
      
      await storage.deleteAddonService(id);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting addon service", { error, householdId, id });
      res.status(500).json({ message: "Failed to delete addon service" });
    }
  });

  /**
   * @openapi
   * /cleaning/next:
   *   get:
   *     tags: [Cleaning Service]
   *     summary: Get next cleaning visit
   *     description: Returns the next scheduled cleaning visit for the household
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Next cleaning visit or null
   *       500:
   *         description: Server error
   */
  app.get("/cleaning/next", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const visit = await storage.getNextCleaningVisit(householdId);
      res.json(visit || null);
    } catch (error) {
      logger.error("Error fetching next cleaning", { error, householdId });
      res.status(500).json({ message: "Failed to fetch next cleaning" });
    }
  });

  /**
   * @openapi
   * /cleaning/visits:
   *   get:
   *     tags: [Cleaning Service]
   *     summary: List cleaning visits
   *     description: Returns all cleaning visits for the household
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: List of cleaning visits
   *       500:
   *         description: Server error
   */
  app.get("/cleaning/visits", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const visits = await storage.getCleaningVisits(householdId);
      res.json(visits);
    } catch (error) {
      logger.error("Error fetching cleaning visits", { error, householdId });
      res.status(500).json({ message: "Failed to fetch cleaning visits" });
    }
  });

  /**
   * @openapi
   * /cleaning/visits:
   *   post:
   *     tags: [Cleaning Service]
   *     summary: Create a cleaning visit
   *     description: Creates a new cleaning visit for the household
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
   *     responses:
   *       201:
   *         description: Cleaning visit created
   *       500:
   *         description: Server error
   */
  app.post("/cleaning/visits", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const visit = await storage.createCleaningVisit({
        ...req.body,
        householdId,
      });
      res.status(201).json(visit);
    } catch (error) {
      logger.error("Error creating cleaning visit", { error, householdId });
      res.status(500).json({ message: "Failed to create cleaning visit" });
    }
  });

  /**
   * @openapi
   * /cleaning/visits/{id}:
   *   patch:
   *     tags: [Cleaning Service]
   *     summary: Update a cleaning visit
   *     description: Updates an existing cleaning visit
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Cleaning visit updated
   *       404:
   *         description: Cleaning visit not found
   *       500:
   *         description: Server error
   */
  app.patch("/cleaning/visits/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const visit = await storage.updateCleaningVisit(id, req.body);
      if (!visit) {
        return res.status(404).json({ message: "Cleaning visit not found" });
      }
      res.json(visit);
    } catch (error) {
      logger.error("Error updating cleaning visit", { error, id });
      res.status(500).json({ message: "Failed to update cleaning visit" });
    }
  });
}
