/**
 * API Routes for Proactive AI
 * 
 * FILE: server/routes.ts
 * ACTION: Add these endpoints to your routes
 */

// ============================================================================
// ADD THESE ROUTES TO YOUR registerRoutes FUNCTION
// ============================================================================

// Get proactive insights for the current household
app.get("/api/ai/insights", isAuthenticated, householdContext, async (req: any, res) => {
  try {
    const householdId = req.householdId!;
    const { getProactiveInsights } = await import("./services/ai-agent");
    
    const insights = await getProactiveInsights(householdId);
    res.json({ insights });
  } catch (error) {
    console.error("Error fetching proactive insights:", error);
    res.status(500).json({ message: "Failed to fetch insights" });
  }
});

// Trigger immediate proactive analysis (for testing/refresh)
app.post("/api/ai/insights/refresh", expensiveLimiter, isAuthenticated, householdContext, async (req: any, res) => {
  try {
    const householdId = req.householdId!;
    const { gatherHouseholdContext, generateProactiveInsights } = await import("./services/ai-agent");
    
    const context = await gatherHouseholdContext(householdId);
    const insights = await generateProactiveInsights(context);
    
    res.json({ insights, generated: insights.length });
  } catch (error) {
    console.error("Error generating insights:", error);
    res.status(500).json({ message: "Failed to generate insights" });
  }
});

// Dismiss an insight
app.post("/api/ai/insights/:id/dismiss", isAuthenticated, householdContext, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { dismissInsight } = await import("./services/ai-agent");
    
    await dismissInsight(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error dismissing insight:", error);
    res.status(500).json({ message: "Failed to dismiss insight" });
  }
});

// Get smart duration estimate
app.get("/api/ai/estimate-duration", isAuthenticated, householdContext, async (req: any, res) => {
  try {
    const householdId = req.householdId!;
    const { category } = req.query;
    
    if (!category) {
      return res.status(400).json({ message: "Category required" });
    }
    
    const { getSmartEstimate } = await import("./services/ai-agent");
    const estimate = await getSmartEstimate(householdId, category as string);
    
    res.json(estimate);
  } catch (error) {
    console.error("Error getting estimate:", error);
    res.status(500).json({ message: "Failed to get estimate" });
  }
});

// Record task completion for learning
app.post("/api/ai/learn/task-complete", isAuthenticated, householdContext, async (req: any, res) => {
  try {
    const householdId = req.householdId!;
    const { taskId, category, estimatedMinutes, createdAt, completedAt } = req.body;
    
    const { recordTaskCompletion } = await import("./services/ai-agent");
    
    await recordTaskCompletion({
      id: taskId,
      householdId,
      category,
      estimatedMinutes,
      createdAt: new Date(createdAt),
      completedAt: new Date(completedAt),
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error recording task completion:", error);
    res.status(500).json({ message: "Failed to record completion" });
  }
});
