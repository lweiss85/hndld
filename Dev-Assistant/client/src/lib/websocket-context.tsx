import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useUser } from "./user-context";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "./queryClient";
import { useToast } from "@/hooks/use-toast";

interface WSMessage {
  type: string;
  payload: any;
  timestamp: string;
}

interface WSContextValue {
  isConnected: boolean;
  lastMessage: WSMessage | null;
  send: (message: any) => void;
}

const WebSocketContext = createContext<WSContextValue>({
  isConnected: false,
  lastMessage: null,
  send: () => {},
});

const WS_RECONNECT_DELAY = 3000;
const WS_MAX_RECONNECT_ATTEMPTS = 10;

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { userProfile } = useUser();
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    const householdId = userProfile?.householdId;
    if (!user?.id || !householdId) {
      disconnect();
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    disconnect();

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${user.id}:${householdId}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WS] Connected");
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
      };

      ws.onclose = (event) => {
        console.log("[WS] Disconnected:", event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;

        if (reconnectAttemptsRef.current < WS_MAX_RECONNECT_ATTEMPTS && event.code !== 4001) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            console.log(`[WS] Reconnecting... attempt ${reconnectAttemptsRef.current}`);
            connect();
          }, WS_RECONNECT_DELAY);
        }
      };

      ws.onerror = (error) => {
        console.error("[WS] Error:", error);
      };

      ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          setLastMessage(message);
          handleWSMessage(message);
        } catch (e) {
          console.error("[WS] Parse error:", e);
        }
      };
    } catch (error) {
      console.error("[WS] Connection error:", error);
    }
  }, [user?.id, userProfile?.householdId, disconnect]);

  const handleWSMessage = useCallback((message: WSMessage) => {
    const { type, payload } = message;

    switch (type) {
      case "connected":
        break;

      case "task:created":
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        toast({ description: `New task: ${payload.title}` });
        break;

      case "task:updated":
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", payload.id] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        break;

      case "task:deleted":
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        break;

      case "approval:created":
        queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        toast({ description: "New approval request" });
        break;

      case "approval:updated":
        queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        break;

      case "update:created":
        queryClient.invalidateQueries({ queryKey: ["/api/updates"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        toast({ description: "New update posted" });
        break;

      case "request:created":
        queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        toast({ description: `New request: ${payload.title || "Incoming request"}` });
        break;

      case "request:updated":
        queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
        break;

      case "spending:created":
        queryClient.invalidateQueries({ queryKey: ["/api/spending"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        break;

      case "spending:updated":
        queryClient.invalidateQueries({ queryKey: ["/api/spending"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        break;

      case "calendar:synced":
        queryClient.invalidateQueries({ queryKey: ["/api/calendar"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        break;

      case "message:received":
        queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
        toast({ description: "New message received" });
        break;

      case "notification:new":
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
        break;

      default:
        console.log("[WS] Unhandled message type:", type);
    }
  }, [toast]);

  const send = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return (
    <WebSocketContext.Provider value={{ isConnected, lastMessage, send }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWS() {
  return useContext(WebSocketContext);
}
