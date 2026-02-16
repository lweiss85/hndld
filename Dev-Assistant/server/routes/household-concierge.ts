import type { Request, Response } from "express";
import type { Router } from "express";
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

export function registerHouseholdConciergeRoutes(app: Router) {
  // ============================================
  // HOUSEHOLD CONCIERGE ENDPOINTS
  // ============================================

  // Onboarding Status Endpoints
  /**
   * @openapi
   * /concierge/onboarding/status:
   *   get:
   *     summary: Get onboarding status
   *     description: Returns the completion status of all three onboarding phases for the current household.
   *     tags:
   *       - Onboarding
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Onboarding status retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 phase1Complete:
   *                   type: boolean
   *                 phase2Complete:
   *                   type: boolean
   *                 phase3Complete:
   *                   type: boolean
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.get("/onboarding/status", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/onboarding/complete-phase:
   *   post:
   *     summary: Complete an onboarding phase
   *     description: Marks a specific onboarding phase (1, 2, or 3) as complete. Only assistants can complete phases.
   *     tags:
   *       - Onboarding
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
   *               - phase
   *             properties:
   *               phase:
   *                 type: integer
   *                 enum: [1, 2, 3]
   *                 description: The onboarding phase number to mark as complete
   *     responses:
   *       200:
   *         description: Phase completed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 phase1Complete:
   *                   type: boolean
   *                 phase2Complete:
   *                   type: boolean
   *                 phase3Complete:
   *                   type: boolean
   *       400:
   *         description: Invalid phase number
   *       403:
   *         description: Only assistants can complete onboarding phases
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.post("/onboarding/complete-phase", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/onboarding/settings:
   *   post:
   *     summary: Save onboarding settings
   *     description: Saves household settings during the onboarding flow.
   *     tags:
   *       - Onboarding
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
   *             description: Household settings key-value pairs to save
   *     responses:
   *       200:
   *         description: Settings saved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.post("/onboarding/settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/onboarding/save-step:
   *   post:
   *     summary: Save an onboarding step
   *     description: Saves data for a specific onboarding step (basics, people, preferences, dates, locations, or access).
   *     tags:
   *       - Onboarding
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
   *               - step
   *               - data
   *             properties:
   *               step:
   *                 type: string
   *                 enum: [basics, people, preferences, dates, locations, access]
   *                 description: The onboarding step to save data for
   *               data:
   *                 type: object
   *                 description: Step-specific data payload
   *     responses:
   *       200:
   *         description: Step data saved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *       400:
   *         description: Unknown step name
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.post("/onboarding/save-step", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/household:
   *   get:
   *     summary: Get current household
   *     description: Returns the current household record, used for service type detection and household context.
   *     tags:
   *       - Household Settings
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Household retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Household'
   *       404:
   *         description: Household not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  // Get current household (for service type detection)
  app.get("/household", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/household/settings:
   *   get:
   *     summary: Get household settings
   *     description: Returns the household settings. Creates default settings if none exist.
   *     tags:
   *       - Household Settings
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Household settings retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Household settings object
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  // Household Settings Endpoints
  app.get("/household/settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/household/settings:
   *   put:
   *     summary: Update household settings
   *     description: Updates the household settings. Only assistants can update settings.
   *     tags:
   *       - Household Settings
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
   *             description: Household settings fields to update
   *     responses:
   *       200:
   *         description: Household settings updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Updated household settings
   *       403:
   *         description: Only assistants can update household settings
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.put("/household/settings", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/household/locations:
   *   get:
   *     summary: List household locations
   *     description: Returns all locations associated with the current household.
   *     tags:
   *       - Locations
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Locations retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 description: Household location record
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  // Household Locations Endpoints
  app.get("/household/locations", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/household/locations:
   *   post:
   *     summary: Create a household location
   *     description: Creates a new location for the household. Only assistants can create locations.
   *     tags:
   *       - Locations
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
   *             description: Location data (name, address, type, notes, etc.)
   *     responses:
   *       201:
   *         description: Location created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Created location record
   *       403:
   *         description: Only assistants can create locations
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.post("/household/locations", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/household/locations/{id}:
   *   put:
   *     summary: Update a household location
   *     description: Updates an existing household location by ID. Only assistants can update locations.
   *     tags:
   *       - Locations
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Location ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: Location fields to update
   *     responses:
   *       200:
   *         description: Location updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Updated location record
   *       403:
   *         description: Only assistants can update locations
   *       404:
   *         description: Location not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.put("/household/locations/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/household/locations/{id}:
   *   delete:
   *     summary: Delete a household location
   *     description: Deletes a household location by ID. Requires CAN_MANAGE_SETTINGS permission.
   *     tags:
   *       - Locations
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Location ID
   *     responses:
   *       204:
   *         description: Location deleted successfully
   *       404:
   *         description: Location not found
   *       403:
   *         description: Insufficient permissions
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.delete("/household/locations/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/people:
   *   get:
   *     summary: List household people
   *     description: Returns all people (family members, contacts) associated with the current household.
   *     tags:
   *       - People
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: People retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 description: Person record
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  // People Endpoints
  app.get("/people", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/people:
   *   post:
   *     summary: Create a person
   *     description: Creates a new person in the household. Only assistants can create people.
   *     tags:
   *       - People
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
   *             description: Person data (name, relationship, notes, etc.)
   *     responses:
   *       201:
   *         description: Person created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Created person record
   *       403:
   *         description: Only assistants can create people
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.post("/people", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/people/{id}:
   *   put:
   *     summary: Update a person
   *     description: Updates an existing person by ID. Only assistants can update people.
   *     tags:
   *       - People
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Person ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: Person fields to update
   *     responses:
   *       200:
   *         description: Person updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Updated person record
   *       403:
   *         description: Only assistants can update people
   *       404:
   *         description: Person not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.put("/people/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/people/{id}:
   *   delete:
   *     summary: Delete a person
   *     description: Deletes a person from the household by ID. Requires CAN_MANAGE_SETTINGS permission.
   *     tags:
   *       - People
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Person ID
   *     responses:
   *       204:
   *         description: Person deleted successfully
   *       404:
   *         description: Person not found
   *       403:
   *         description: Insufficient permissions
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.delete("/people/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/preferences:
   *   get:
   *     summary: List household preferences
   *     description: Returns all preferences for the current household.
   *     tags:
   *       - Preferences
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Preferences retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 description: Preference record
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  // Preferences Endpoints
  app.get("/preferences", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/preferences:
   *   post:
   *     summary: Create a preference
   *     description: Creates a new preference for the household. Only assistants can create preferences.
   *     tags:
   *       - Preferences
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
   *             description: Preference data (category, key, value, notes, etc.)
   *     responses:
   *       201:
   *         description: Preference created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Created preference record
   *       403:
   *         description: Only assistants can create preferences
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.post("/preferences", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/preferences/{id}:
   *   put:
   *     summary: Update a preference
   *     description: Updates an existing preference by ID. Only assistants can update preferences.
   *     tags:
   *       - Preferences
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Preference ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: Preference fields to update
   *     responses:
   *       200:
   *         description: Preference updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Updated preference record
   *       403:
   *         description: Only assistants can update preferences
   *       404:
   *         description: Preference not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.put("/preferences/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/preferences/{id}:
   *   delete:
   *     summary: Delete a preference
   *     description: Deletes a preference by ID. Requires CAN_MANAGE_SETTINGS permission.
   *     tags:
   *       - Preferences
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Preference ID
   *     responses:
   *       204:
   *         description: Preference deleted successfully
   *       404:
   *         description: Preference not found
   *       403:
   *         description: Insufficient permissions
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.delete("/preferences/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/important-dates:
   *   get:
   *     summary: List important dates
   *     description: Returns all important dates (birthdays, anniversaries, etc.) for the current household.
   *     tags:
   *       - Important Dates
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Important dates retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 description: Important date record
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  // Important Dates Endpoints
  app.get("/important-dates", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/important-dates:
   *   post:
   *     summary: Create an important date
   *     description: Creates a new important date for the household. Only assistants can create important dates.
   *     tags:
   *       - Important Dates
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
   *             description: Important date data (title, date, type, recurring, notes, etc.)
   *     responses:
   *       201:
   *         description: Important date created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Created important date record
   *       403:
   *         description: Only assistants can create important dates
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.post("/important-dates", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/important-dates/{id}:
   *   put:
   *     summary: Update an important date
   *     description: Updates an existing important date by ID. Only assistants can update important dates.
   *     tags:
   *       - Important Dates
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Important date ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: Important date fields to update
   *     responses:
   *       200:
   *         description: Important date updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Updated important date record
   *       403:
   *         description: Only assistants can update important dates
   *       404:
   *         description: Important date not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.put("/important-dates/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/important-dates/{id}:
   *   delete:
   *     summary: Delete an important date
   *     description: Deletes an important date by ID. Requires CAN_MANAGE_SETTINGS permission.
   *     tags:
   *       - Important Dates
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Important date ID
   *     responses:
   *       204:
   *         description: Important date deleted successfully
   *       404:
   *         description: Important date not found
   *       403:
   *         description: Insufficient permissions
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.delete("/important-dates/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_SETTINGS"), async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/access-items:
   *   get:
   *     summary: List vault access items
   *     description: Returns access items for the household. Staff users only see items they have active grants for, with sensitive values masked. Assistants see all items unmasked.
   *     tags:
   *       - Vault
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Access items retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 description: Access item record (sensitive values may be masked)
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  // Access Items Endpoints
  app.get("/access-items", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/access-items:
   *   post:
   *     summary: Create a vault access item
   *     description: Creates a new access item in the vault. Sensitive values are encrypted. Only assistants can create access items.
   *     tags:
   *       - Vault
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
   *             description: Access item data (label, value, category, isSensitive, notes, etc.)
   *     responses:
   *       201:
   *         description: Access item created successfully (sensitive values returned masked)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Created access item record
   *       403:
   *         description: Only assistants can create access items
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.post("/access-items", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/access-items/{id}:
   *   put:
   *     summary: Update a vault access item
   *     description: Updates an existing access item. Sensitive values are re-encrypted. Requires CAN_EDIT_VAULT permission.
   *     tags:
   *       - Vault
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Access item ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: Access item fields to update
   *     responses:
   *       200:
   *         description: Access item updated successfully (sensitive values returned masked)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Updated access item record
   *       404:
   *         description: Access item not found
   *       403:
   *         description: Insufficient permissions
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.put("/access-items/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/access-items/{id}:
   *   delete:
   *     summary: Delete a vault access item
   *     description: Deletes an access item from the vault. Requires CAN_EDIT_VAULT permission.
   *     tags:
   *       - Vault
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Access item ID
   *     responses:
   *       204:
   *         description: Access item deleted successfully
   *       404:
   *         description: Access item not found
   *       403:
   *         description: Insufficient permissions
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.delete("/access-items/:id", isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/access-items/{id}/reveal:
   *   post:
   *     summary: Reveal a vault access item value
   *     description: Decrypts and returns the actual value of an access item. Staff users must have an active grant. Assistants have full access.
   *     tags:
   *       - Vault
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Access item ID
   *     responses:
   *       200:
   *         description: Value revealed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 value:
   *                   type: string
   *                   description: The decrypted access item value
   *       404:
   *         description: Item not found
   *       403:
   *         description: No active grant for this item or access denied
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.post("/access-items/:id/reveal", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/access-items/{id}/grants:
   *   get:
   *     summary: List grants for an access item
   *     description: Returns all access grants for a specific vault item. Requires CAN_EDIT_VAULT permission.
   *     tags:
   *       - Vault
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Access item ID
   *     responses:
   *       200:
   *         description: Grants retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 description: Access item grant record
   *       404:
   *         description: Item not found
   *       403:
   *         description: Insufficient permissions
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  // Access Item Grants (for STAFF access management)
  app.get("/access-items/:id/grants", isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/access-items/{id}/grants:
   *   post:
   *     summary: Create a grant for an access item
   *     description: Grants a user access to a specific vault item with optional expiration. Requires CAN_EDIT_VAULT permission.
   *     tags:
   *       - Vault
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Access item ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - userId
   *             properties:
   *               userId:
   *                 type: string
   *                 description: The user ID to grant access to
   *               expiresAt:
   *                 type: string
   *                 format: date-time
   *                 description: Optional expiration date for the grant
   *     responses:
   *       201:
   *         description: Grant created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Created grant record
   *       404:
   *         description: Item not found
   *       403:
   *         description: Insufficient permissions
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.post("/access-items/:id/grants", isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/access-items/{id}/grants/{grantId}:
   *   delete:
   *     summary: Delete a grant for an access item
   *     description: Revokes a specific access grant. Requires CAN_EDIT_VAULT permission.
   *     tags:
   *       - Vault
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Access item ID
   *       - in: path
   *         name: grantId
   *         required: true
   *         schema:
   *           type: string
   *         description: Grant ID to delete
   *     responses:
   *       204:
   *         description: Grant deleted successfully
   *       404:
   *         description: Grant not found
   *       403:
   *         description: Insufficient permissions
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.delete("/access-items/:id/grants/:grantId", isAuthenticated, householdContext, requirePermission("CAN_EDIT_VAULT"), async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/quick-request-templates:
   *   get:
   *     summary: List active quick request templates
   *     description: Returns all active quick request templates for the household.
   *     tags:
   *       - Household Settings
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Active templates retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 description: Quick request template record
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  // Quick Request Templates Endpoints
  app.get("/quick-request-templates", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/quick-request-templates/all:
   *   get:
   *     summary: List all quick request templates (including inactive)
   *     description: Returns all quick request templates for the household, including inactive ones. Only assistants can view all templates.
   *     tags:
   *       - Household Settings
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: All templates retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 description: Quick request template record
   *       403:
   *         description: Only assistants can view all templates
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.get("/quick-request-templates/all", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/quick-request-templates:
   *   post:
   *     summary: Create a quick request template
   *     description: Creates a new quick request template. Only assistants can create templates.
   *     tags:
   *       - Household Settings
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
   *             description: Quick request template data
   *     responses:
   *       201:
   *         description: Template created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Created template record
   *       400:
   *         description: Invalid request data
   *       403:
   *         description: Only assistants can create templates
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.post("/quick-request-templates", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/quick-request-templates/{id}:
   *   patch:
   *     summary: Update a quick request template
   *     description: Partially updates an existing quick request template. Only assistants can update templates.
   *     tags:
   *       - Household Settings
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Template ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: Template fields to update
   *     responses:
   *       200:
   *         description: Template updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Updated template record
   *       400:
   *         description: Invalid request data
   *       403:
   *         description: Only assistants can update templates
   *       404:
   *         description: Template not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.patch("/quick-request-templates/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/quick-request-templates/{id}:
   *   delete:
   *     summary: Delete a quick request template
   *     description: Deletes a quick request template by ID. Only assistants can delete templates.
   *     tags:
   *       - Household Settings
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Template ID
   *     responses:
   *       204:
   *         description: Template deleted successfully
   *       404:
   *         description: Template not found
   *       403:
   *         description: Only assistants can delete templates
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.delete("/quick-request-templates/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/playbooks:
   *   get:
   *     summary: List playbooks
   *     description: Returns all playbooks (SOP templates) for the current household.
   *     tags:
   *       - Playbooks
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Playbooks retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 description: Playbook record
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  // Playbooks (SOP Templates) Endpoints
  app.get("/playbooks", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/playbooks/{id}:
   *   get:
   *     summary: Get a playbook with steps
   *     description: Returns a specific playbook by ID along with its ordered steps.
   *     tags:
   *       - Playbooks
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Playbook ID
   *     responses:
   *       200:
   *         description: Playbook retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Playbook record with steps array
   *       404:
   *         description: Playbook not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.get("/playbooks/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/playbooks:
   *   post:
   *     summary: Create a playbook
   *     description: Creates a new playbook with optional steps. Only assistants can create playbooks. Requires CAN_MANAGE_PLAYBOOKS permission.
   *     tags:
   *       - Playbooks
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
   *             description: Playbook data with optional steps array
   *             properties:
   *               title:
   *                 type: string
   *               description:
   *                 type: string
   *               category:
   *                 type: string
   *               steps:
   *                 type: array
   *                 items:
   *                   type: object
   *                   description: Playbook step data
   *     responses:
   *       201:
   *         description: Playbook created successfully with steps
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Created playbook record with steps
   *       400:
   *         description: Invalid request data
   *       403:
   *         description: Only assistants can create playbooks
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.post("/playbooks", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_PLAYBOOKS"), async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/playbooks/{id}:
   *   patch:
   *     summary: Update a playbook
   *     description: Partially updates an existing playbook. If steps are provided, existing steps are replaced. Only assistants can update playbooks. Requires CAN_MANAGE_PLAYBOOKS permission.
   *     tags:
   *       - Playbooks
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Playbook ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: Playbook fields to update with optional steps array
   *             properties:
   *               title:
   *                 type: string
   *               description:
   *                 type: string
   *               category:
   *                 type: string
   *               steps:
   *                 type: array
   *                 items:
   *                   type: object
   *                   description: Replacement playbook step data
   *     responses:
   *       200:
   *         description: Playbook updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Updated playbook record with steps
   *       400:
   *         description: Invalid request data
   *       403:
   *         description: Only assistants can update playbooks
   *       404:
   *         description: Playbook not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.patch("/playbooks/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_PLAYBOOKS"), async (req: Request, res: Response) => {
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

  /**
   * @openapi
   * /concierge/playbooks/{id}:
   *   delete:
   *     summary: Delete a playbook
   *     description: Deletes a playbook and its associated steps. Only assistants can delete playbooks. Requires CAN_MANAGE_PLAYBOOKS permission.
   *     tags:
   *       - Playbooks
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Playbook ID
   *     responses:
   *       204:
   *         description: Playbook deleted successfully
   *       404:
   *         description: Playbook not found
   *       403:
   *         description: Only assistants can delete playbooks
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  app.delete("/playbooks/:id", isAuthenticated, householdContext, requirePermission("CAN_MANAGE_PLAYBOOKS"), async (req: Request, res: Response) => {
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
