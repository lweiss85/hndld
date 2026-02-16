import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import logger from "../lib/logger";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { requirePermission } from "../middleware/requirePermission";
import { encryptVaultValue, decryptVaultValue } from "../services/vault-encryption";
import { escapeHtml } from "../lib/escape-html";
import {
  insertHouseholdSettingsSchema, insertHouseholdLocationSchema, insertPersonSchema,
  insertPreferenceSchema, insertImportantDateSchema, insertAccessItemSchema,
  insertQuickRequestTemplateSchema, insertPlaybookSchema, insertPlaybookStepSchema
} from "@shared/schema";
import { db } from "../db";
import { households } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const householdContext = householdContextMiddleware;

async function getUserProfile(userId: string) {
  return storage.getUserProfile(userId);
}

export function registerHouseholdConciergeRoutes(app: Express) {
  // ============================================
  // HOUSEHOLD CONCIERGE ENDPOINTS
  // ============================================

  // Onboarding Status Endpoints
  app.get("/api/onboarding/status", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const settings = await storage.getHouseholdSettings(householdId);
      
      res.json({
        phase1Complete: settings?.onboardingPhase1Complete ?? false,
        phase2Complete: settings?.onboardingPhase2Complete ?? false,
        phase3Complete: settings?.onboardingPhase3Complete ?? false,
      });
    } catch (error) {
      logger.error("Error fetching onboarding status", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch onboarding status" });
    }
  });

  app.post("/api/onboarding/complete-phase", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can complete onboarding phases" });
      }
      
      const phaseSchema = z.object({
        phase: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      });
      
      const parseResult = phaseSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid phase. Must be 1, 2, or 3" });
      }
      
      const { phase } = parseResult.data;
      const updateData: any = {};
      
      if (phase === 1) updateData.onboardingPhase1Complete = true;
      if (phase === 2) updateData.onboardingPhase2Complete = true;
      if (phase === 3) updateData.onboardingPhase3Complete = true;
      
      const settings = await storage.upsertHouseholdSettings(householdId, updateData);
      
      res.json({
        phase1Complete: settings.onboardingPhase1Complete,
        phase2Complete: settings.onboardingPhase2Complete,
        phase3Complete: settings.onboardingPhase3Complete,
      });
    } catch (error) {
      logger.error("Error completing onboarding phase", { error, userId, householdId });
      res.status(500).json({ message: "Failed to complete onboarding phase" });
    }
  });

  app.post("/api/onboarding/settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const settings = req.body;
      
      await storage.upsertHouseholdSettings(householdId, {
        ...settings,
        householdId,
      });
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error saving onboarding settings", { error, householdId });
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  app.post("/api/onboarding/save-step", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { step, data } = req.body;
      const householdId = req.householdId!;
      
      switch (step) {
        case "basics":
          await storage.upsertHouseholdSettings(householdId, {
            ...data,
            householdId,
          });
          break;
          
        case "people":
          if (Array.isArray(data.people)) {
            for (const person of data.people) {
              await storage.createPerson({
                householdId,
                ...person,
              });
            }
          }
          break;
          
        case "preferences":
          if (Array.isArray(data.preferences)) {
            for (const pref of data.preferences) {
              await storage.createPreference({
                householdId,
                ...pref,
              });
            }
          }
          break;
          
        case "dates":
          if (Array.isArray(data.dates)) {
            for (const date of data.dates) {
              await storage.createImportantDate({
                householdId,
                ...date,
              });
            }
          }
          break;
          
        case "locations":
          if (Array.isArray(data.locations)) {
            for (const location of data.locations) {
              await storage.createHouseholdLocation({
                householdId,
                ...location,
              });
            }
          }
          break;
          
        case "access":
          if (Array.isArray(data.accessItems)) {
            for (const item of data.accessItems) {
              await storage.createAccessItem({
                householdId,
                ...item,
              });
            }
          }
          break;
          
        default:
          return res.status(400).json({ error: `Unknown step: ${step}` });
      }
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error saving onboarding step", { error, householdId });
      res.status(500).json({ error: "Failed to save step data" });
    }
  });

  // Get current household (for service type detection)
  app.get("/api/household", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const [household] = await db
        .select()
        .from(households)
        .where(eq(households.id, householdId))
        .limit(1);
      
      if (!household) {
        return res.status(404).json({ message: "Household not found" });
      }
      
      res.json(household);
    } catch (error) {
      logger.error("Error fetching household", { error, householdId });
      res.status(500).json({ message: "Failed to fetch household" });
    }
  });

  // Household Settings Endpoints
  app.get("/api/household/settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      let settings = await storage.getHouseholdSettings(householdId);
      
      if (!settings) {
        settings = await storage.upsertHouseholdSettings(householdId, {});
      }
      
      res.json(settings);
    } catch (error) {
      logger.error("Error fetching household settings", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch household settings" });
    }
  });

  app.put("/api/household/settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can update household settings" });
      }
      
      const settings = await storage.upsertHouseholdSettings(householdId, req.body);
      res.json(settings);
    } catch (error) {
      logger.error("Error updating household settings", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update household settings" });
    }
  });

  // Household Locations Endpoints
  app.get("/api/household/locations", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const locations = await storage.getHouseholdLocations(householdId);
      res.json(locations);
    } catch (error) {
      logger.error("Error fetching household locations", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch household locations" });
    }
  });

  app.post("/api/household/locations", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create locations" });
      }
      
      const location = await storage.createHouseholdLocation({
        ...req.body,
        householdId,
      });
      
      res.status(201).json(location);
    } catch (error) {
      logger.error("Error creating household location", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create household location" });
    }
  });

  app.put("/api/household/locations/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can update locations" });
      }
      
      const location = await storage.updateHouseholdLocation(householdId, req.params.id, req.body);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }
      res.json(location);
    } catch (error) {
      logger.error("Error updating household location", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update household location" });
    }
  });

  app.delete("/api/household/locations/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      const deleted = await storage.deleteHouseholdLocation(householdId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Location not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting household location", { error, householdId });
      res.status(500).json({ message: "Failed to delete household location" });
    }
  });

  // People Endpoints
  app.get("/api/people", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const people = await storage.getPeople(householdId);
      res.json(people);
    } catch (error) {
      logger.error("Error fetching people", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch people" });
    }
  });

  app.post("/api/people", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create people" });
      }
      
      const person = await storage.createPerson({
        ...req.body,
        householdId,
      });
      
      res.status(201).json(person);
    } catch (error) {
      logger.error("Error creating person", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create person" });
    }
  });

  app.put("/api/people/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can update people" });
      }
      
      const person = await storage.updatePerson(householdId, req.params.id, req.body);
      if (!person) {
        return res.status(404).json({ message: "Person not found" });
      }
      res.json(person);
    } catch (error) {
      logger.error("Error updating person", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update person" });
    }
  });

  app.delete("/api/people/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      const deleted = await storage.deletePerson(householdId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Person not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting person", { error, householdId });
      res.status(500).json({ message: "Failed to delete person" });
    }
  });

  // Preferences Endpoints
  app.get("/api/preferences", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const preferences = await storage.getPreferences(householdId);
      res.json(preferences);
    } catch (error) {
      logger.error("Error fetching preferences", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch preferences" });
    }
  });

  app.post("/api/preferences", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create preferences" });
      }
      
      const preference = await storage.createPreference({
        ...req.body,
        householdId,
        createdByUserId: userId,
      });
      
      res.status(201).json(preference);
    } catch (error) {
      logger.error("Error creating preference", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create preference" });
    }
  });

  app.put("/api/preferences/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can update preferences" });
      }
      
      const preference = await storage.updatePreference(householdId, req.params.id, req.body);
      if (!preference) {
        return res.status(404).json({ message: "Preference not found" });
      }
      res.json(preference);
    } catch (error) {
      logger.error("Error updating preference", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update preference" });
    }
  });

  app.delete("/api/preferences/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      const deleted = await storage.deletePreference(householdId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Preference not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting preference", { error, householdId });
      res.status(500).json({ message: "Failed to delete preference" });
    }
  });

  // Important Dates Endpoints
  app.get("/api/important-dates", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const importantDates = await storage.getImportantDates(householdId);
      res.json(importantDates);
    } catch (error) {
      logger.error("Error fetching important dates", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch important dates" });
    }
  });

  app.post("/api/important-dates", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create important dates" });
      }
      
      const importantDate = await storage.createImportantDate({
        ...req.body,
        householdId,
      });
      
      res.status(201).json(importantDate);
    } catch (error) {
      logger.error("Error creating important date", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create important date" });
    }
  });

  app.put("/api/important-dates/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can update important dates" });
      }
      
      const importantDate = await storage.updateImportantDate(householdId, req.params.id, req.body);
      if (!importantDate) {
        return res.status(404).json({ message: "Important date not found" });
      }
      res.json(importantDate);
    } catch (error) {
      logger.error("Error updating important date", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update important date" });
    }
  });

  app.delete("/api/important-dates/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      const deleted = await storage.deleteImportantDate(householdId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Important date not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting important date", { error, householdId });
      res.status(500).json({ message: "Failed to delete important date" });
    }
  });

  // Access Items Endpoints
  app.get("/api/access-items", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      
      let accessItems = await storage.getAccessItems(householdId);
      
      if (userRole === "STAFF") {
        const grants = await storage.getActiveGrantsForUser(userId, householdId);
        const grantedItemIds = new Set(grants.map(g => g.accessItemId));
        accessItems = accessItems.filter(item => grantedItemIds.has(item.id));
        const maskedItems = accessItems.map(item => ({
          ...item,
          value: item.isSensitive ? "********" : item.value,
        }));
        res.json(maskedItems);
      } else if (userRole === "ASSISTANT") {
        res.json(accessItems);
      } else {
        const maskedItems = accessItems.map(item => ({
          ...item,
          value: item.isSensitive ? "********" : item.value,
        }));
        res.json(maskedItems);
      }
    } catch (error) {
      logger.error("Error fetching access items", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch access items" });
    }
  });

  app.post("/api/access-items", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const profile = await getUserProfile(userId);
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create access items" });
      }
      
      const data = req.body;
      const encryptedValue = data.isSensitive 
        ? encryptVaultValue(data.value)
        : data.value;
      
      const accessItem = await storage.createAccessItem({
        ...data,
        value: encryptedValue,
        isEncrypted: data.isSensitive ?? false,
        householdId,
      });
      
      res.status(201).json({
        ...accessItem,
        value: data.isSensitive ? "********" : data.value,
      });
    } catch (error) {
      logger.error("Error creating access item", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create access item" });
    }
  });

  app.put("/api/access-items/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const data = req.body;
      
      if (data.value !== undefined) {
        const isSensitive = data.isSensitive ?? true;
        data.value = isSensitive 
          ? encryptVaultValue(data.value)
          : data.value;
        data.isEncrypted = isSensitive;
      }
      
      const accessItem = await storage.updateAccessItem(householdId, req.params.id, data);
      if (!accessItem) {
        return res.status(404).json({ message: "Access item not found" });
      }
      res.json({
        ...accessItem,
        value: accessItem.isSensitive ? "********" : accessItem.value,
      });
    } catch (error) {
      logger.error("Error updating access item", { error, householdId });
      res.status(500).json({ message: "Failed to update access item" });
    }
  });

  app.delete("/api/access-items/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      
      const deleted = await storage.deleteAccessItem(householdId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Access item not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting access item", { error, householdId });
      res.status(500).json({ message: "Failed to delete access items" });
    }
  });

  app.post("/api/access-items/:id/reveal", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      
      const item = await storage.getAccessItem(householdId, id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      if (userRole === "STAFF") {
        const grant = await storage.getAccessItemGrantForUser(id, userId, householdId);
        if (!grant || (grant.expiresAt && new Date(grant.expiresAt) < new Date())) {
          return res.status(403).json({ error: "No active grant for this item" });
        }
      } else if (userRole !== "ASSISTANT") {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const decryptedValue = item.isEncrypted 
        ? decryptVaultValue(item.value)
        : item.value;
      
      res.json({ value: decryptedValue });
    } catch (error) {
      logger.error("Error revealing access item", { error, userId, householdId });
      res.status(500).json({ error: "Failed to reveal item" });
    }
  });

  // Access Item Grants (for STAFF access management)
  app.get("/api/access-items/:id/grants", isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const householdId = req.householdId!;
      
      const item = await storage.getAccessItem(householdId, id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const grants = await storage.getAccessItemGrants(id);
      res.json(grants);
    } catch (error) {
      logger.error("Error fetching access item grants", { error, householdId });
      res.status(500).json({ error: "Failed to fetch grants" });
    }
  });

  app.post("/api/access-items/:id/grants", isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { userId: grantUserId, expiresAt } = req.body;
      const grantedBy = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const item = await storage.getAccessItem(householdId, id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const grant = await storage.createAccessItemGrant({
        accessItemId: id,
        userId: grantUserId,
        householdId,
        createdBy: grantedBy,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });
      
      res.status(201).json(grant);
    } catch (error) {
      logger.error("Error creating access item grant", { error, householdId });
      res.status(500).json({ error: "Failed to create grant" });
    }
  });

  app.delete("/api/access-items/:id/grants/:grantId", isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
    try {
      const { grantId } = req.params;
      
      const deleted = await storage.deleteAccessItemGrant(grantId);
      if (!deleted) {
        return res.status(404).json({ error: "Grant not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting access item grant", { error, grantId });
      res.status(500).json({ error: "Failed to delete grant" });
    }
  });

  // Quick Request Templates Endpoints
  app.get("/api/quick-request-templates", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const templates = await storage.getQuickRequestTemplates(householdId);
      res.json(templates.filter(t => t.isActive));
    } catch (error) {
      logger.error("Error fetching quick request templates", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch quick request templates" });
    }
  });

  app.get("/api/quick-request-templates/all", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can view all templates" });
      }
      
      const templates = await storage.getQuickRequestTemplates(householdId);
      res.json(templates);
    } catch (error) {
      logger.error("Error fetching all quick request templates", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch quick request templates" });
    }
  });

  app.post("/api/quick-request-templates", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create templates" });
      }
      
      const validatedData = insertQuickRequestTemplateSchema.parse({
        ...req.body,
        householdId,
      });
      
      const template = await storage.createQuickRequestTemplate(validatedData);
      res.status(201).json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      logger.error("Error creating quick request template", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create quick request template" });
    }
  });

  app.patch("/api/quick-request-templates/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can update templates" });
      }
      
      const updateSchema = insertQuickRequestTemplateSchema.partial().omit({ householdId: true });
      const validatedData = updateSchema.parse(req.body);
      
      const template = await storage.updateQuickRequestTemplate(householdId, req.params.id, validatedData);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      logger.error("Error updating quick request template", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update quick request template" });
    }
  });

  app.delete("/api/quick-request-templates/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can delete templates" });
      }
      
      const deleted = await storage.deleteQuickRequestTemplate(householdId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting quick request template", { error, userId, householdId });
      res.status(500).json({ message: "Failed to delete quick request template" });
    }
  });

  // Playbooks (SOP Templates) Endpoints
  app.get("/api/playbooks", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const playbooksList = await storage.getPlaybooks(householdId);
      res.json(playbooksList);
    } catch (error) {
      logger.error("Error fetching playbooks", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch playbooks" });
    }
  });

  app.get("/api/playbooks/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const playbook = await storage.getPlaybook(householdId, req.params.id);
      if (!playbook) {
        return res.status(404).json({ message: "Playbook not found" });
      }
      
      const steps = await storage.getPlaybookSteps(playbook.id);
      res.json({ ...playbook, steps });
    } catch (error) {
      logger.error("Error fetching playbook", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch playbook" });
    }
  });

  app.post("/api/playbooks", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_PLAYBOOKS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can create playbooks" });
      }
      
      const { steps, ...playbookData } = req.body;
      const validatedData = insertPlaybookSchema.parse({
        ...playbookData,
        householdId,
        createdBy: userId,
      });
      
      const playbook = await storage.createPlaybook(validatedData);
      
      if (steps && Array.isArray(steps)) {
        for (let i = 0; i < steps.length; i++) {
          const stepData = insertPlaybookStepSchema.parse({
            ...steps[i],
            playbookId: playbook.id,
            stepNumber: i + 1,
          });
          await storage.createPlaybookStep(stepData);
        }
      }
      
      const createdSteps = await storage.getPlaybookSteps(playbook.id);
      res.status(201).json({ ...playbook, steps: createdSteps });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      logger.error("Error creating playbook", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create playbook" });
    }
  });

  app.patch("/api/playbooks/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_PLAYBOOKS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can update playbooks" });
      }
      
      const existing = await storage.getPlaybook(householdId, req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Playbook not found" });
      }
      
      const { steps, ...playbookData } = req.body;
      const updateSchema = insertPlaybookSchema.partial().omit({ householdId: true, createdBy: true });
      const validatedData = updateSchema.parse(playbookData);
      
      const playbook = await storage.updatePlaybook(householdId, req.params.id, validatedData);
      
      if (steps && Array.isArray(steps)) {
        const existingSteps = await storage.getPlaybookSteps(req.params.id);
        for (const step of existingSteps) {
          await storage.deletePlaybookStep(householdId, req.params.id, step.id);
        }
        
        for (let i = 0; i < steps.length; i++) {
          const stepData = insertPlaybookStepSchema.parse({
            ...steps[i],
            playbookId: req.params.id,
            stepNumber: i + 1,
          });
          await storage.createPlaybookStep(stepData);
        }
      }
      
      const updatedSteps = await storage.getPlaybookSteps(req.params.id);
      res.json({ ...playbook, steps: updatedSteps });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      logger.error("Error updating playbook", { error, userId, householdId });
      res.status(500).json({ message: "Failed to update playbook" });
    }
  });

  app.delete("/api/playbooks/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_PLAYBOOKS"), async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can delete playbooks" });
      }
      
      const deleted = await storage.deletePlaybook(householdId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Playbook not found" });
      }
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting playbook", { error, userId, householdId });
      res.status(500).json({ message: "Failed to delete playbook" });
    }
  });
}
