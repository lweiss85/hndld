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
