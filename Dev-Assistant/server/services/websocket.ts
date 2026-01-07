import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { parse } from "url";

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  householdId?: string;
  isAlive?: boolean;
}

export interface BroadcastMessage {
  type: string;
  payload: any;
  householdId: string;
  excludeUserId?: string;
}

export type WSEventType = 
  | "task:created" 
  | "task:updated" 
  | "task:deleted"
  | "approval:created"
  | "approval:updated"
  | "update:created"
  | "request:created"
  | "request:updated"
  | "spending:created"
  | "spending:updated"
  | "calendar:synced"
  | "message:received"
  | "notification:new";

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<AuthenticatedSocket>> = new Map();
  private userSockets: Map<string, Set<AuthenticatedSocket>> = new Map();
  private initialized = false;

  initialize(server: Server) {
    if (this.initialized) {
      console.log("[WebSocket] Already initialized, skipping");
      return;
    }
    this.initialized = true;
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on("connection", (ws: AuthenticatedSocket, req) => {
      const { query } = parse(req.url || "", true);
      const token = query.token as string;
      
      this.authenticateSocket(ws, token);

      ws.isAlive = true;

      ws.on("pong", () => {
        ws.isAlive = true;
      });

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (e) {
          console.error("WebSocket message parse error:", e);
        }
      });

      ws.on("close", () => {
        this.removeClient(ws);
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        this.removeClient(ws);
      });
    });

    const interval = setInterval(() => {
      this.wss?.clients.forEach((ws: WebSocket) => {
        const authWs = ws as AuthenticatedSocket;
        if (authWs.isAlive === false) {
          this.removeClient(authWs);
          return authWs.terminate();
        }
        authWs.isAlive = false;
        authWs.ping();
      });
    }, 30000);

    this.wss.on("close", () => {
      clearInterval(interval);
    });

    console.log("[WebSocket] Server initialized on /ws");
  }

  private authenticateSocket(ws: AuthenticatedSocket, token: string) {
    try {
      if (!token) {
        ws.close(4001, "Missing authentication token");
        return;
      }

      const [userId, householdId] = token.split(":");
      
      if (!userId || !householdId) {
        ws.close(4001, "Invalid authentication token");
        return;
      }

      ws.userId = userId;
      ws.householdId = householdId;

      if (!this.clients.has(householdId)) {
        this.clients.set(householdId, new Set());
      }
      this.clients.get(householdId)!.add(ws);

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(ws);

      ws.send(JSON.stringify({
        type: "connected",
        payload: { userId, householdId }
      }));

      console.log(`[WebSocket] Client connected: user=${userId}, household=${householdId}`);
    } catch (error) {
      console.error("Socket authentication error:", error);
      ws.close(4001, "Authentication failed");
    }
  }

  private removeClient(ws: AuthenticatedSocket) {
    if (ws.householdId) {
      this.clients.get(ws.householdId)?.delete(ws);
      if (this.clients.get(ws.householdId)?.size === 0) {
        this.clients.delete(ws.householdId);
      }
    }
    if (ws.userId) {
      this.userSockets.get(ws.userId)?.delete(ws);
      if (this.userSockets.get(ws.userId)?.size === 0) {
        this.userSockets.delete(ws.userId);
      }
    }
  }

  private handleMessage(ws: AuthenticatedSocket, message: any) {
    switch (message.type) {
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      case "subscribe":
        break;
      default:
        console.log("[WebSocket] Unknown message type:", message.type);
    }
  }

  broadcast(eventType: WSEventType, payload: any, householdId: string, excludeUserId?: string) {
    const householdClients = this.clients.get(householdId);
    if (!householdClients || householdClients.size === 0) {
      return;
    }

    const message = JSON.stringify({
      type: eventType,
      payload,
      timestamp: new Date().toISOString(),
    });

    let sentCount = 0;
    householdClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        if (!excludeUserId || client.userId !== excludeUserId) {
          try {
            client.send(message);
            sentCount++;
          } catch (error) {
            console.error("[WebSocket] Error sending message to client:", error);
            this.removeClient(client);
          }
        }
      }
    });

    if (sentCount > 0) {
      console.log(`[WebSocket] Broadcast ${eventType} to ${sentCount} clients in household ${householdId}`);
    }
  }

  sendToUser(userId: string, eventType: WSEventType, payload: any) {
    const userClients = this.userSockets.get(userId);
    if (!userClients) return;

    const message = JSON.stringify({
      type: eventType,
      payload,
      timestamp: new Date().toISOString(),
    });

    userClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          console.error("[WebSocket] Error sending message to user:", error);
          this.removeClient(client);
        }
      }
    });
  }

  getConnectionCount(householdId?: string): number {
    if (householdId) {
      return this.clients.get(householdId)?.size || 0;
    }
    let total = 0;
    this.clients.forEach((clients) => {
      total += clients.size;
    });
    return total;
  }
}

export const wsManager = new WebSocketManager();
