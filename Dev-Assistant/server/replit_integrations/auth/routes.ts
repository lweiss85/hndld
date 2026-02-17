import type { Express, Request, Response } from "express";
import logger from "../../lib/logger";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      logger.error("Error fetching user", { error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
