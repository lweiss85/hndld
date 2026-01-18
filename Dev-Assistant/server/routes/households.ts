import { Router } from "express";
import { storage } from "../storage";

const router = Router();

router.get("/mine", async (req: any, res) => {
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
    res.status(500).json({ error: "Failed to fetch households" });
  }
});

router.post("/set-default", async (req: any, res) => {
  try {
    const { householdId } = req.body;
    const userId = req.user.claims.sub;
    
    const userHouseholds = await storage.getUserHouseholds(userId);
    const hasAccess = userHouseholds.some(h => h.id === householdId);
    
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied to this household" });
    }
    
    await storage.setDefaultHousehold(userId, householdId);
    
    res.json({ success: true, defaultHouseholdId: householdId });
  } catch (error) {
    console.error("Error setting default household:", error);
    res.status(500).json({ error: "Failed to set default household" });
  }
});

export default router;
