import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { households, userProfiles } from "../../shared/schema";

const router = Router();

router.get("/mine", async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    
    const userHouseholds = await db
      .select({
        household: households,
        role: userProfiles.role,
      })
      .from(userProfiles)
      .leftJoin(households, eq(userProfiles.householdId, households.id))
      .where(eq(userProfiles.userId, userId));
    
    res.json(userHouseholds.map(uh => ({
      ...uh.household,
      userRole: uh.role,
    })));
  } catch (error) {
    console.error("Error fetching user households:", error);
    res.status(500).json({ error: "Failed to fetch households" });
  }
});

router.post("/set-default", async (req: any, res) => {
  try {
    const { householdId } = req.body;
    const userId = req.user.claims.sub;
    
    const profile = await db.query.userProfiles.findFirst({
      where: and(
        eq(userProfiles.userId, userId),
        eq(userProfiles.householdId, householdId)
      ),
    });
    
    if (!profile) {
      return res.status(403).json({ error: "Access denied to this household" });
    }
    
    // Clear isDefault on all user profiles for this user
    await db.update(userProfiles)
      .set({ isDefault: false })
      .where(eq(userProfiles.userId, userId));
    
    // Set isDefault on the selected profile
    await db.update(userProfiles)
      .set({ isDefault: true })
      .where(and(
        eq(userProfiles.userId, userId),
        eq(userProfiles.householdId, householdId)
      ));
    
    res.json({ success: true, defaultHouseholdId: householdId });
  } catch (error) {
    console.error("Error setting default household:", error);
    res.status(500).json({ error: "Failed to set default household" });
  }
});

export default router;
