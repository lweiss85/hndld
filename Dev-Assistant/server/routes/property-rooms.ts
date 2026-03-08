import { Router, Request, Response } from "express";
import { db } from "../db";
import { propertyRooms, properties } from "@shared/schema";
import { eq, and, asc } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import logger from "../lib/logger";

const router = Router();

router.get(
  "/properties/:propertyId/rooms",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { propertyId } = req.params;

      const [property] = await db
        .select()
        .from(properties)
        .where(and(eq(properties.id, propertyId), eq(properties.householdId, householdId)))
        .limit(1);

      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }

      const rooms = await db
        .select()
        .from(propertyRooms)
        .where(
          and(
            eq(propertyRooms.propertyId, propertyId),
            eq(propertyRooms.householdId, householdId),
            eq(propertyRooms.isActive, true)
          )
        )
        .orderBy(asc(propertyRooms.sortOrder), asc(propertyRooms.name));

      res.json({ rooms });
    } catch (error: unknown) {
      logger.error("Failed to fetch property rooms", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch rooms" });
    }
  }
);

router.post(
  "/properties/:propertyId/rooms",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { propertyId } = req.params;

      const [property] = await db
        .select()
        .from(properties)
        .where(and(eq(properties.id, propertyId), eq(properties.householdId, householdId)))
        .limit(1);

      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }

      const { name, roomType, floor, approximateSqFt, flooringType, surfaceNotes, cleaningPriority, specialInstructions, skipDays, estimatedCleanMinutes, photoUrls, sortOrder } = req.body;

      if (!name || !roomType) {
        return res.status(400).json({ error: "name and roomType are required" });
      }

      const [room] = await db
        .insert(propertyRooms)
        .values({
          propertyId,
          householdId,
          name,
          roomType,
          floor,
          approximateSqFt,
          flooringType,
          surfaceNotes,
          cleaningPriority,
          specialInstructions,
          skipDays,
          estimatedCleanMinutes,
          photoUrls,
          sortOrder,
        })
        .returning();

      logger.info("Property room created", { roomId: room.id, propertyId, householdId });

      res.status(201).json({ room });
    } catch (error: unknown) {
      logger.error("Failed to create property room", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to create room" });
    }
  }
);

router.patch(
  "/properties/:propertyId/rooms/:roomId",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { propertyId, roomId } = req.params;

      const { name, roomType, floor, approximateSqFt, flooringType, surfaceNotes, cleaningPriority, specialInstructions, skipDays, estimatedCleanMinutes, photoUrls, sortOrder } = req.body;
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) updateData.name = name;
      if (roomType !== undefined) updateData.roomType = roomType;
      if (floor !== undefined) updateData.floor = floor;
      if (approximateSqFt !== undefined) updateData.approximateSqFt = approximateSqFt;
      if (flooringType !== undefined) updateData.flooringType = flooringType;
      if (surfaceNotes !== undefined) updateData.surfaceNotes = surfaceNotes;
      if (cleaningPriority !== undefined) updateData.cleaningPriority = cleaningPriority;
      if (specialInstructions !== undefined) updateData.specialInstructions = specialInstructions;
      if (skipDays !== undefined) updateData.skipDays = skipDays;
      if (estimatedCleanMinutes !== undefined) updateData.estimatedCleanMinutes = estimatedCleanMinutes;
      if (photoUrls !== undefined) updateData.photoUrls = photoUrls;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

      const [room] = await db
        .update(propertyRooms)
        .set(updateData)
        .where(
          and(
            eq(propertyRooms.id, roomId),
            eq(propertyRooms.propertyId, propertyId),
            eq(propertyRooms.householdId, householdId)
          )
        )
        .returning();

      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }

      res.json({ room });
    } catch (error: unknown) {
      logger.error("Failed to update property room", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to update room" });
    }
  }
);

router.delete(
  "/properties/:propertyId/rooms/:roomId",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { propertyId, roomId } = req.params;

      const [room] = await db
        .update(propertyRooms)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(propertyRooms.id, roomId),
            eq(propertyRooms.propertyId, propertyId),
            eq(propertyRooms.householdId, householdId)
          )
        )
        .returning();

      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }

      res.json({ room });
    } catch (error: unknown) {
      logger.error("Failed to delete property room", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to delete room" });
    }
  }
);

router.put(
  "/properties/:propertyId/rooms/reorder",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { propertyId } = req.params;
      const { roomIds } = req.body;

      if (!Array.isArray(roomIds) || roomIds.length === 0) {
        return res.status(400).json({ error: "roomIds array is required" });
      }

      const updates = roomIds.map((id: string, index: number) =>
        db
          .update(propertyRooms)
          .set({ sortOrder: index, updatedAt: new Date() })
          .where(
            and(
              eq(propertyRooms.id, id),
              eq(propertyRooms.propertyId, propertyId),
              eq(propertyRooms.householdId, householdId)
            )
          )
      );

      await Promise.all(updates);

      const rooms = await db
        .select()
        .from(propertyRooms)
        .where(
          and(
            eq(propertyRooms.propertyId, propertyId),
            eq(propertyRooms.householdId, householdId),
            eq(propertyRooms.isActive, true)
          )
        )
        .orderBy(asc(propertyRooms.sortOrder), asc(propertyRooms.name));

      res.json({ rooms });
    } catch (error: unknown) {
      logger.error("Failed to reorder property rooms", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to reorder rooms" });
    }
  }
);

export function registerPropertyRoomRoutes(app: Router) {
  app.use(router);
}
