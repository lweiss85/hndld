# Replit Agent Prompt: Fix Critical Issues in hndld App

You are a senior full-stack engineer working on the **hndld** app (household concierge platform). The app is built with:
- **Backend:** Node.js + Express + TypeScript + Drizzle ORM + PostgreSQL
- **Frontend:** React + Vite + TypeScript + TailwindCSS + shadcn/ui + Wouter (routing)
- **Architecture:** Multi-tenant (Organizations → Households → Users)

The app has an **excellent foundation** but **3 critical blockers** preventing production launch. Your task is to fix these issues systematically.

---

## 🎯 OBJECTIVE

Fix the **3 critical blockers** in priority order:
1. **Multi-household switching** (currently broken)
2. **Fix onboarding endpoints** (missing routes)
3. **Implement real vault security** (currently fake)

Then add **2 high-impact features**:
4. **Google Calendar OAuth integration**
5. **Household invite system**

---

## 📋 PART 1: MULTI-HOUSEHOLD SWITCHING (CRITICAL - 8 hours)

### Problem
The app uses `getOrCreateMyHousehold()` which means assistants managing multiple households see **mixed data**. There's no way to switch between households in the UI.

### What Already Exists
- ✅ Multi-tenancy schema (organizations, households, user_profiles)
- ✅ Organization assignment
- ✅ Household creation routes

### What's Missing
- ❌ Household switcher UI component
- ❌ Active household stored in localStorage/session
- ❌ `X-Household-Id` header support in API
- ❌ Permission checking per household
- ❌ API endpoints to list and set active household

---

### Step 1.1: Add Missing API Endpoints

**Create: `server/routes/households.ts`** (new file)

```typescript
import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { households, userProfiles } from "../../shared/schema";

const router = Router();

// Get all households user has access to
router.get("/mine", async (req: any, res) => {
  try {
    const userId = req.user.userId;
    
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

// Set default household for quick access
router.post("/set-default", async (req: any, res) => {
  try {
    const { householdId } = req.body;
    const userId = req.user.userId;
    
    // Verify user has access to this household
    const profile = await db.query.userProfiles.findFirst({
      where: and(
        eq(userProfiles.userId, userId),
        eq(userProfiles.householdId, householdId)
      ),
    });
    
    if (!profile) {
      return res.status(403).json({ error: "Access denied to this household" });
    }
    
    // Store in user metadata or separate table
    // For now, just return success (frontend will handle via localStorage)
    res.json({ success: true });
  } catch (error) {
    console.error("Error setting default household:", error);
    res.status(500).json({ error: "Failed to set default household" });
  }
});

export default router;
```

**Update: `server/routes.ts`** - Add household routes

```typescript
// Near the top where you import routes
import householdRoutes from "./routes/households";

// After authentication setup
app.use("/api/households", isAuthenticated, householdRoutes);
```

---

### Step 1.2: Add Household Context Middleware

**Update: `server/routes.ts`** - Add middleware to extract active household

```typescript
// Add this middleware after isAuthenticated
async function householdContext(req: any, res: any, next: any) {
  try {
    const userId = req.user.userId;
    
    // Try to get household ID from:
    // 1. X-Household-Id header (priority)
    // 2. Query param
    // 3. Body
    let householdId = 
      req.headers["x-household-id"] || 
      req.query.householdId ||
      req.body.householdId;
    
    // If no household ID provided, use user's first household
    if (!householdId) {
      const profile = await db.query.userProfiles.findFirst({
        where: eq(userProfiles.userId, userId),
      });
      householdId = profile?.householdId;
    }
    
    // If still no household, create default
    if (!householdId) {
      householdId = await getOrCreateDefaultHousehold(userId);
    }
    
    // Verify user has access to this household
    const hasAccess = await db.query.userProfiles.findFirst({
      where: and(
        eq(userProfiles.userId, userId),
        eq(userProfiles.householdId, householdId)
      ),
    });
    
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied to this household" });
    }
    
    // Attach to request
    req.householdId = householdId;
    next();
  } catch (error) {
    console.error("Household context error:", error);
    res.status(500).json({ error: "Failed to determine household context" });
  }
}

// Apply to all household-scoped routes
// Replace all instances of getOrCreateDefaultHousehold() in routes with req.householdId
```

**IMPORTANT:** Go through `server/routes.ts` and replace:
```typescript
// OLD PATTERN (find and replace):
const householdId = await getOrCreateDefaultHousehold(userId, orgId);

// NEW PATTERN:
const householdId = req.householdId; // Already set by middleware
```

Apply `householdContext` middleware to all routes that need household access:
```typescript
app.get("/api/tasks", isAuthenticated, householdContext, async (req: any, res) => {
  const householdId = req.householdId;
  // ... rest of code
});
```

---

### Step 1.3: Update Frontend API Client

**Update: `client/src/lib/queryClient.ts`**

```typescript
// Add household header to all requests
export const apiRequest = async (
  method: string, 
  url: string, 
  data?: any
) => {
  const activeHouseholdId = localStorage.getItem("activeHouseholdId");
  
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(activeHouseholdId && { "X-Household-Id": activeHouseholdId }),
    },
    credentials: "include",
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    if (response.status === 403) {
      // Lost access to household
      localStorage.removeItem("activeHouseholdId");
      window.location.reload();
    }
    throw new Error(await response.text());
  }

  return response.json();
};
```

---

### Step 1.4: Create Household Switcher Component

**Create: `client/src/components/household-switcher.tsx`**

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Building2, Check, ChevronDown, Plus } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Household {
  id: string;
  name: string;
  userRole: string;
}

export function HouseholdSwitcher() {
  const { toast } = useToast();
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(
    localStorage.getItem("activeHouseholdId")
  );

  const { data: households, isLoading } = useQuery<Household[]>({
    queryKey: ["/api/households/mine"],
  });

  // Set first household as active if none selected
  useEffect(() => {
    if (households && households.length > 0 && !activeHouseholdId) {
      const firstHousehold = households[0].id;
      setActiveHouseholdId(firstHousehold);
      localStorage.setItem("activeHouseholdId", firstHousehold);
    }
  }, [households, activeHouseholdId]);

  const activeHousehold = households?.find(h => h.id === activeHouseholdId);

  const switchHousehold = (householdId: string) => {
    setActiveHouseholdId(householdId);
    localStorage.setItem("activeHouseholdId", householdId);
    
    // Invalidate all queries to refetch with new household context
    queryClient.invalidateQueries();
    
    toast({
      title: "Household switched",
      description: `Now managing: ${households?.find(h => h.id === householdId)?.name}`,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <Building2 className="h-4 w-4" />
        <span>Loading...</span>
      </div>
    );
  }

  if (!households || households.length === 0) {
    return null;
  }

  // Only show switcher if user has access to multiple households
  if (households.length === 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{households[0].name}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          className="gap-2 px-3 h-auto py-2"
          data-testid="household-switcher"
        >
          <Building2 className="h-4 w-4" />
          <div className="flex flex-col items-start">
            <span className="text-xs text-muted-foreground">Managing</span>
            <span className="text-sm font-medium">
              {activeHousehold?.name || "Select Household"}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Switch Household</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {households.map((household) => (
          <DropdownMenuItem
            key={household.id}
            onClick={() => switchHousehold(household.id)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex flex-col">
              <span className="font-medium">{household.name}</span>
              <span className="text-xs text-muted-foreground capitalize">
                {household.userRole.toLowerCase()}
              </span>
            </div>
            {household.id === activeHouseholdId && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 cursor-pointer text-muted-foreground">
          <Plus className="h-4 w-4" />
          <span>Create New Household</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

### Step 1.5: Add Switcher to Header

**Update: `client/src/components/layout/header.tsx`**

```typescript
import { HouseholdSwitcher } from "@/components/household-switcher";

export function Header() {
  const { user, logout } = useAuth();
  const { activeRole, setActiveRole, canSwitchRoles } = useUser();
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur-sm">
      <div className="flex h-14 items-center justify-between gap-4 px-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">hndld</h1>
          
          {/* ADD HOUSEHOLD SWITCHER HERE */}
          {activeRole === "ASSISTANT" && <HouseholdSwitcher />}
          
          {canSwitchRoles && (
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50">
              {/* existing role toggle */}
            </div>
          )}
        </div>
        {/* rest of header */}
      </div>
    </header>
  );
}
```

---

## 📋 PART 2: FIX ONBOARDING ENDPOINTS (2 hours)

### Problem
Onboarding UI calls `/api/onboarding/settings` and `/api/onboarding/save-step` which don't exist.

### Solution: Add Proxy Endpoints

**Update: `server/routes.ts`** - Add missing onboarding endpoints

```typescript
// Add after existing onboarding routes

// Save onboarding settings (proxy to household settings)
app.post("/api/onboarding/settings", isAuthenticated, householdContext, async (req: any, res) => {
  try {
    const householdId = req.householdId;
    const settings = req.body;
    
    await storage.upsertHouseholdSettings(householdId, {
      ...settings,
      householdId,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error saving onboarding settings:", error);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// Save onboarding step data
app.post("/api/onboarding/save-step", isAuthenticated, householdContext, async (req: any, res) => {
  try {
    const { step, data } = req.body;
    const householdId = req.householdId;
    const userId = req.user.userId;
    
    switch (step) {
      case "basics":
        // Save household settings
        await storage.upsertHouseholdSettings(householdId, {
          ...data,
          householdId,
        });
        break;
        
      case "people":
        // Save people
        if (Array.isArray(data.people)) {
          for (const person of data.people) {
            await db.insert(people).values({
              householdId,
              ...person,
            });
          }
        }
        break;
        
      case "preferences":
        // Save preferences
        if (Array.isArray(data.preferences)) {
          for (const pref of data.preferences) {
            await db.insert(preferences).values({
              householdId,
              ...pref,
            });
          }
        }
        break;
        
      case "dates":
        // Save important dates
        if (Array.isArray(data.dates)) {
          for (const date of data.dates) {
            await db.insert(importantDates).values({
              householdId,
              ...date,
            });
          }
        }
        break;
        
      case "locations":
        // Save locations
        if (Array.isArray(data.locations)) {
          for (const location of data.locations) {
            await db.insert(householdLocations).values({
              householdId,
              ...location,
            });
          }
        }
        break;
        
      case "access":
        // Save access items
        if (Array.isArray(data.accessItems)) {
          for (const item of data.accessItems) {
            await db.insert(accessItems).values({
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
    console.error("Error saving onboarding step:", error);
    res.status(500).json({ error: "Failed to save step data" });
  }
});
```

---

## 📋 PART 3: IMPLEMENT VAULT SECURITY (6 hours)

### Problem
Vault has backend PIN endpoints but UI doesn't use them. Access items show real values (CSS masked only).

---

### Step 3.1: Create Vault Context Provider

**Create: `client/src/lib/vault-context.tsx`**

```typescript
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

interface VaultSession {
  unlocked: boolean;
  expiresAt: number;
}

interface VaultContextType {
  vaultSession: VaultSession | null;
  requestVaultAccess: () => Promise<boolean>;
  lockVault: () => void;
  isVaultUnlocked: boolean;
}

const VaultContext = createContext<VaultContextType | null>(null);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [vaultSession, setVaultSession] = useState<VaultSession | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

  // Auto-lock after inactivity
  useEffect(() => {
    if (!vaultSession) return;
    
    const checkExpiry = () => {
      if (Date.now() > vaultSession.expiresAt) {
        setVaultSession(null);
      }
    };
    
    const intervalId = setInterval(checkExpiry, 1000);
    return () => clearInterval(intervalId);
  }, [vaultSession]);

  const requestVaultAccess = useCallback((): Promise<boolean> => {
    // If already unlocked and not expired, grant access
    if (vaultSession && Date.now() < vaultSession.expiresAt) {
      return Promise.resolve(true);
    }
    
    // Otherwise, show unlock modal
    return new Promise<boolean>((resolve) => {
      setResolvePromise(() => resolve);
      setShowUnlockModal(true);
    });
  }, [vaultSession]);

  const handleUnlock = useCallback((success: boolean) => {
    if (success) {
      // Set 5-minute vault session
      setVaultSession({
        unlocked: true,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
    }
    
    setShowUnlockModal(false);
    if (resolvePromise) {
      resolvePromise(success);
      setResolvePromise(null);
    }
  }, [resolvePromise]);

  const lockVault = useCallback(() => {
    setVaultSession(null);
  }, []);

  const isVaultUnlocked = vaultSession !== null && Date.now() < vaultSession.expiresAt;

  return (
    <VaultContext.Provider value={{ vaultSession, requestVaultAccess, lockVault, isVaultUnlocked }}>
      {children}
      {showUnlockModal && (
        <VaultUnlockModal 
          open={showUnlockModal}
          onUnlock={handleUnlock}
          onCancel={() => handleUnlock(false)}
        />
      )}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error("useVault must be used within VaultProvider");
  }
  return context;
}

// Unlock Modal Component
function VaultUnlockModal({ 
  open, 
  onUnlock, 
  onCancel 
}: { 
  open: boolean; 
  onUnlock: (success: boolean) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = async () => {
    setIsVerifying(true);
    setError("");
    
    try {
      const result = await apiRequest("POST", "/api/vault/verify-pin", { pin });
      
      if (result.valid) {
        onUnlock(true);
        setPin("");
      } else {
        setError("Incorrect PIN");
        setPin("");
      }
    } catch (err) {
      setError("Verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Enter Vault PIN
          </DialogTitle>
          <DialogDescription>
            Enter your PIN to access sensitive information
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex justify-center my-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="h-8 w-8 text-primary" />
            </div>
          </div>
          
          <div>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ""));
                setError("");
              }}
              placeholder="Enter PIN"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && pin.length >= 4) {
                  handleVerify();
                }
              }}
            />
            {error && (
              <p className="text-sm text-destructive mt-2">{error}</p>
            )}
          </div>
        </div>
        
        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isVerifying}
          >
            Cancel
          </Button>
          <Button
            onClick={handleVerify}
            disabled={pin.length < 4 || isVerifying}
            className="flex-1"
          >
            {isVerifying ? "Verifying..." : "Unlock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

### Step 3.2: Add Vault Provider to App

**Update: `client/src/main.tsx`** or wherever you have providers

```typescript
import { VaultProvider } from "@/lib/vault-context";

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <VaultProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </VaultProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
```

---

### Step 3.3: Create Vault Setup Component

**Create: `client/src/components/vault-setup.tsx`**

```typescript
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function VaultSetupModal({ 
  open, 
  onClose 
}: { 
  open: boolean; 
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");

  const setupMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/vault/set-pin", { pin });
    },
    onSuccess: () => {
      toast({ 
        title: "Vault secured",
        description: "Your sensitive information is now protected",
      });
      onClose();
      setPin("");
      setConfirmPin("");
    },
    onError: () => {
      setError("Failed to set PIN. Please try again.");
    },
  });

  const handleSubmit = () => {
    if (pin !== confirmPin) {
      setError("PINs do not match");
      return;
    }
    
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }
    
    setupMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Set Vault PIN
          </DialogTitle>
          <DialogDescription>
            Create a 4-6 digit PIN to protect sensitive information like passwords and access codes
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">PIN</label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ""));
                setError("");
              }}
              placeholder="Enter 4-6 digit PIN"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium mb-1 block">Confirm PIN</label>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => {
                setConfirmPin(e.target.value.replace(/\D/g, ""));
                setError("");
              }}
              placeholder="Re-enter PIN"
              onKeyDown={(e) => {
                if (e.key === "Enter" && pin === confirmPin && pin.length >= 4) {
                  handleSubmit();
                }
              }}
            />
          </div>
          
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <Alert>
            <AlertDescription>
              This PIN will be required to view sensitive information. Make sure to remember it.
            </AlertDescription>
          </Alert>
        </div>
        
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pin !== confirmPin || pin.length < 4 || setupMutation.isPending}
          >
            {setupMutation.isPending ? "Setting up..." : "Set PIN"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

### Step 3.4: Update Access Items to Use Vault

**Update: `client/src/pages/household-profile.tsx`** - Find the AccessTab component

```typescript
import { useVault } from "@/lib/vault-context";

function AccessTab({ items, isAssistant }: { items: AccessItem[]; isAssistant: boolean }) {
  const { requestVaultAccess } = useVault();
  const [revealedItems, setRevealedItems] = useState<Set<string>>(new Set());
  const [showSetupModal, setShowSetupModal] = useState(false);

  const handleReveal = async (itemId: string) => {
    const granted = await requestVaultAccess();
    
    if (granted) {
      setRevealedItems(prev => new Set(prev).add(itemId));
      
      // Log vault access
      await apiRequest("POST", "/api/audit-logs", {
        action: "VAULT_ACCESS",
        entityType: "ACCESS_ITEM",
        entityId: itemId,
      });
      
      // Auto-hide after 30 seconds
      setTimeout(() => {
        setRevealedItems(prev => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }, 30000);
    }
  };

  return (
    <div className="space-y-4">
      {isAssistant && (
        <div className="flex justify-between items-center">
          <Button onClick={() => setShowSetupModal(true)}>
            <Lock className="h-4 w-4 mr-2" />
            Setup Vault PIN
          </Button>
        </div>
      )}
      
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <label className="text-sm font-medium block mb-1">
                      {item.title}
                    </label>
                    
                    {revealedItems.has(item.id) ? (
                      <Input 
                        value={item.value} 
                        readOnly 
                        className="font-mono"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input 
                          value="••••••••••••" 
                          disabled 
                          className="flex-1"
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => handleReveal(item.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    
                    {item.username && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Username: {item.username}
                      </p>
                    )}
                  </div>
                  
                  {isAssistant && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost">
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      <VaultSetupModal 
        open={showSetupModal} 
        onClose={() => setShowSetupModal(false)} 
      />
    </div>
  );
}
```

---

### Step 3.5: Backend Enhancement - Mask by Default

**Update: `server/routes.ts`** - Modify the `/api/access-items` endpoint

```typescript
app.get("/api/access-items", isAuthenticated, householdContext, async (req: any, res) => {
  try {
    const householdId = req.householdId;
    const items = await storage.getAccessItems(householdId);
    
    // Mask sensitive values by default
    // (Vault unlock happens client-side, reveal only on explicit request)
    const masked = items.map(item => ({
      ...item,
      value: item.isSensitive ? "••••••••••••" : item.value,
    }));
    
    res.json(masked);
  } catch (error) {
    console.error("Error fetching access items:", error);
    res.status(500).json({ error: "Failed to fetch access items" });
  }
});

// Add new endpoint to reveal specific item after vault unlock
app.post("/api/access-items/:id/reveal", isAuthenticated, householdContext, async (req: any, res) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId;
    const userId = req.user.userId;
    
    // Get the item
    const item = await db.query.accessItems.findFirst({
      where: eq(accessItems.id, id),
    });
    
    if (!item || item.householdId !== householdId) {
      return res.status(404).json({ error: "Item not found" });
    }
    
    // Log the vault access
    await storage.createAuditLog({
      userId,
      householdId,
      action: "VAULT_ACCESS",
      entityType: "ACCESS_ITEM",
      entityId: id,
      description: `Revealed ${item.title}`,
    });
    
    // Return the real value
    res.json({ value: item.value });
  } catch (error) {
    console.error("Error revealing access item:", error);
    res.status(500).json({ error: "Failed to reveal item" });
  }
});
```

---

## 📋 PART 4: GOOGLE CALENDAR OAUTH (10 hours)

### Prerequisites
```bash
npm install googleapis
```

Add to `.env`:
```
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=https://your-replit-url/api/google/callback
```

---

### Step 4.1: Create Google Calendar Service

**Create: `server/services/google-calendar.ts`**

```typescript
import { google } from "googleapis";
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");

export function encryptToken(token: string): string {
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32));
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  
  let encrypted = cipher.update(token, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  return iv.toString("hex") + ":" + encrypted;
}

export function decryptToken(encrypted: string): string {
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32));
  const parts = encrypted.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const encryptedText = parts[1];
  
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export async function refreshAccessToken(refreshToken: string) {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  
  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials;
}
```

---

### Step 4.2: Add Google Calendar Routes

**Create: `server/routes/google-calendar.ts`**

```typescript
import { Router } from "express";
import { google } from "googleapis";
import { db } from "../db";
import { calendarConnections, calendarSelections, calendarEvents } from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { getOAuthClient, encryptToken, decryptToken, refreshAccessToken } from "../services/google-calendar";

const router = Router();

// 1. Initiate OAuth flow
router.get("/auth", async (req: any, res) => {
  const oauth2Client = getOAuthClient();
  const householdId = req.householdId;
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/calendar.events.readonly",
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    ],
    state: JSON.stringify({ 
      userId: req.user.userId, 
      householdId 
    }),
    prompt: "consent", // Force consent to get refresh token
  });
  
  res.redirect(authUrl);
});

// 2. Handle OAuth callback
router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const { userId, householdId } = JSON.parse(state as string);
    
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code as string);
    
    // Encrypt and store tokens
    const accessTokenEncrypted = encryptToken(tokens.access_token!);
    const refreshTokenEncrypted = tokens.refresh_token 
      ? encryptToken(tokens.refresh_token) 
      : null;
    
    // Check if connection exists
    const existing = await db.query.calendarConnections.findFirst({
      where: eq(calendarConnections.householdId, householdId),
    });
    
    if (existing) {
      // Update existing
      await db.update(calendarConnections)
        .set({
          accessToken: accessTokenEncrypted,
          refreshToken: refreshTokenEncrypted,
          expiresAt: new Date(tokens.expiry_date!),
        })
        .where(eq(calendarConnections.id, existing.id));
    } else {
      // Create new
      await db.insert(calendarConnections).values({
        householdId,
        provider: "GOOGLE",
        accessToken: accessTokenEncrypted,
        refreshToken: refreshTokenEncrypted,
        expiresAt: new Date(tokens.expiry_date!),
      });
    }
    
    res.redirect("/calendar?connected=true");
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.redirect("/calendar?error=connection_failed");
  }
});

// 3. List available calendars
router.get("/calendars", async (req: any, res) => {
  try {
    const householdId = req.householdId;
    
    const connection = await db.query.calendarConnections.findFirst({
      where: eq(calendarConnections.householdId, householdId),
    });
    
    if (!connection) {
      return res.status(400).json({ error: "Not connected to Google Calendar" });
    }
    
    // Decrypt access token
    const accessToken = decryptToken(connection.accessToken);
    
    // Check if token expired
    if (new Date() > connection.expiresAt) {
      // Refresh token
      if (connection.refreshToken) {
        const refreshToken = decryptToken(connection.refreshToken);
        const newTokens = await refreshAccessToken(refreshToken);
        
        // Update in database
        await db.update(calendarConnections)
          .set({
            accessToken: encryptToken(newTokens.access_token!),
            expiresAt: new Date(newTokens.expiry_date!),
          })
          .where(eq(calendarConnections.id, connection.id));
        
        // Use new token
        accessToken = newTokens.access_token!;
      } else {
        return res.status(401).json({ error: "Token expired, please reconnect" });
      }
    }
    
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const { data } = await calendar.calendarList.list();
    
    res.json(data.items || []);
  } catch (error) {
    console.error("Error fetching calendars:", error);
    res.status(500).json({ error: "Failed to fetch calendars" });
  }
});

// 4. Select calendars to sync
router.post("/calendars/select", async (req: any, res) => {
  try {
    const { calendarIds } = req.body;
    const householdId = req.householdId;
    
    // Delete existing selections
    await db.delete(calendarSelections)
      .where(eq(calendarSelections.householdId, householdId));
    
    // Insert new selections
    for (const calendarId of calendarIds) {
      await db.insert(calendarSelections).values({
        householdId,
        calendarId,
        isEnabled: true,
      });
    }
    
    // Trigger immediate sync
    await syncCalendarsForHousehold(householdId);
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error selecting calendars:", error);
    res.status(500).json({ error: "Failed to select calendars" });
  }
});

// 5. Manual sync trigger
router.post("/sync", async (req: any, res) => {
  try {
    const householdId = req.householdId;
    await syncCalendarsForHousehold(householdId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error syncing calendars:", error);
    res.status(500).json({ error: "Failed to sync calendars" });
  }
});

// Sync function
async function syncCalendarsForHousehold(householdId: string) {
  const selections = await db.query.calendarSelections.findMany({
    where: and(
      eq(calendarSelections.householdId, householdId),
      eq(calendarSelections.isEnabled, true)
    ),
  });
  
  const connection = await db.query.calendarConnections.findFirst({
    where: eq(calendarConnections.householdId, householdId),
  });
  
  if (!connection) return;
  
  const accessToken = decryptToken(connection.accessToken);
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ access_token: accessToken });
  
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  
  for (const selection of selections) {
    try {
      const params: any = {
        calendarId: selection.calendarId,
        singleEvents: true,
        orderBy: "startTime",
      };
      
      // Use sync token for incremental sync
      if (selection.syncToken) {
        params.syncToken = selection.syncToken;
      } else {
        params.timeMin = new Date().toISOString();
        params.timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      }
      
      const { data } = await calendar.events.list(params);
      
      // Upsert events
      for (const event of data.items || []) {
        await db.insert(calendarEvents).values({
          householdId,
          providerEventId: event.id!,
          calendarId: selection.calendarId,
          title: event.summary || "Untitled Event",
          description: event.description,
          startAt: new Date(event.start?.dateTime || event.start?.date!),
          endAt: event.end?.dateTime ? new Date(event.end.dateTime) : null,
          location: event.location,
          isAllDay: !event.start?.dateTime,
        }).onConflictDoUpdate({
          target: [calendarEvents.providerEventId],
          set: {
            title: event.summary || "Untitled Event",
            description: event.description,
            startAt: new Date(event.start?.dateTime || event.start?.date!),
            endAt: event.end?.dateTime ? new Date(event.end.dateTime) : null,
            location: event.location,
          },
        });
      }
      
      // Save sync token
      if (data.nextSyncToken) {
        await db.update(calendarSelections)
          .set({ syncToken: data.nextSyncToken })
          .where(eq(calendarSelections.id, selection.id));
      }
    } catch (error) {
      console.error(`Error syncing calendar ${selection.calendarId}:`, error);
    }
  }
}

export default router;
```

---

### Step 4.3: Add Google Routes to Server

**Update: `server/routes.ts`**

```typescript
import googleCalendarRoutes from "./routes/google-calendar";

// Add after other route imports
app.use("/api/google", isAuthenticated, householdContext, googleCalendarRoutes);
```

---

### Step 4.4: Add Scheduled Sync (Cron Job)

**Update: `server/services/scheduler.ts`** (or create if doesn't exist)

```typescript
import cron from "node-cron";
import { db } from "../db";
import { calendarSelections } from "../../shared/schema";
import { eq } from "drizzle-orm";

// Sync calendars every 15 minutes
export function startCalendarSync() {
  cron.schedule("*/15 * * * *", async () => {
    console.log("Running calendar sync...");
    
    const activeHouseholds = await db
      .selectDistinct({ householdId: calendarSelections.householdId })
      .from(calendarSelections)
      .where(eq(calendarSelections.isEnabled, true));
    
    for (const { householdId } of activeHouseholds) {
      try {
        // Import sync function from google-calendar route
        // or move it to a shared service file
        await syncCalendarsForHousehold(householdId);
      } catch (error) {
        console.error(`Calendar sync failed for household ${householdId}:`, error);
      }
    }
  });
}
```

**Update: `server/index.ts`**

```typescript
import { startCalendarSync } from "./services/scheduler";

// After server starts
startCalendarSync();
```

---

### Step 4.5: Add Calendar Connection UI

**Update: `client/src/pages/calendar.tsx`**

```tsx
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarIcon, RefreshCw } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Calendar() {
  const { toast } = useToast();
  const [selectedCalendars, setSelectedCalendars] = useState<string[]>([]);

  const { data: calendars, isLoading: loadingCalendars } = useQuery({
    queryKey: ["/api/google/calendars"],
    retry: false,
  });

  const { data: events, isLoading: loadingEvents } = useQuery({
    queryKey: ["/api/calendar-events"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/google/sync");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      toast({ title: "Calendar synced" });
    },
  });

  const selectMutation = useMutation({
    mutationFn: async (calendarIds: string[]) => {
      return apiRequest("POST", "/api/google/calendars/select", { calendarIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      toast({ title: "Calendars updated" });
    },
  });

  // If not connected, show connect button
  if (!calendars && !loadingCalendars) {
    return (
      <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        
        <Alert>
          <CalendarIcon className="h-4 w-4" />
          <AlertDescription>
            Connect your Google Calendar to automatically sync events
          </AlertDescription>
        </Alert>
        
        <Button asChild>
          <a href="/api/google/auth">
            Connect Google Calendar
          </a>
        </Button>
      </div>
    );
  }

  // Show calendar selection
  return (
    <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <Button 
          size="sm" 
          variant="outline"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Sync Now
        </Button>
      </div>

      {calendars && calendars.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Connected Calendars</CardTitle>
            <CardDescription>
              Select which calendars to sync
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {calendars.map((cal: any) => (
              <div key={cal.id} className="flex items-center gap-3">
                <Checkbox
                  checked={selectedCalendars.includes(cal.id)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedCalendars([...selectedCalendars, cal.id]);
                    } else {
                      setSelectedCalendars(selectedCalendars.filter(id => id !== cal.id));
                    }
                  }}
                />
                <div className="flex-1">
                  <p className="font-medium">{cal.summary}</p>
                  {cal.description && (
                    <p className="text-xs text-muted-foreground">{cal.description}</p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
          <CardFooter>
            <Button 
              onClick={() => selectMutation.mutate(selectedCalendars)}
              disabled={selectedCalendars.length === 0}
            >
              Save Selection
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Display synced events */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Upcoming Events</h2>
        {events?.map((event: any) => (
          <Card key={event.id}>
            <CardContent className="p-4">
              <h3 className="font-medium">{event.title}</h3>
              <p className="text-sm text-muted-foreground">
                {format(new Date(event.startAt), "PPP 'at' p")}
              </p>
              {event.location && (
                <p className="text-xs text-muted-foreground mt-1">
                  📍 {event.location}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

---

## 📋 PART 5: HOUSEHOLD INVITES (8 hours)

### Step 5.1: Add Invite Schema

**Update: `shared/schema.ts`** - Add new table

```typescript
export const householdInvites = pgTable("household_invites", {
  id: varchar("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  householdId: varchar("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  email: varchar("email").notNull(),
  role: varchar("role").notNull(), // ASSISTANT, CLIENT, FAMILY_MEMBER
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  invitedBy: varchar("invited_by").notNull(),
  acceptedAt: timestamp("accepted_at"),
  acceptedBy: varchar("accepted_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Run migration:
```bash
npm run db:push
```

---

### Step 5.2: Add Invite Endpoints

**Create: `server/routes/invites.ts`**

```typescript
import { Router } from "express";
import crypto from "crypto";
import { db } from "../db";
import { householdInvites, userProfiles, households } from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { sendInviteEmail } from "../services/notifications";

const router = Router();

// Send invite
router.post("/:householdId/invite", async (req: any, res) => {
  try {
    const { householdId } = req.params;
    const { email, role } = req.body;
    const userId = req.user.userId;
    
    // Verify user has permission to invite
    const profile = await db.query.userProfiles.findFirst({
      where: and(
        eq(userProfiles.userId, userId),
        eq(userProfiles.householdId, householdId)
      ),
    });
    
    if (!profile || (profile.role !== "ASSISTANT" && profile.role !== "OWNER")) {
      return res.status(403).json({ error: "Permission denied" });
    }
    
    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    // Create invite
    await db.insert(householdInvites).values({
      householdId,
      email,
      role,
      token,
      expiresAt,
      invitedBy: userId,
    });
    
    // Get household details
    const household = await db.query.households.findFirst({
      where: eq(households.id, householdId),
    });
    
    // Send email (implement this in notifications service)
    await sendInviteEmail({
      to: email,
      householdName: household?.name || "Household",
      inviteLink: `${process.env.APP_URL || req.headers.origin}/join/${token}`,
      role,
    });
    
    res.json({ success: true, token });
  } catch (error) {
    console.error("Error creating invite:", error);
    res.status(500).json({ error: "Failed to send invite" });
  }
});

// Accept invite
router.post("/join/:token", async (req: any, res) => {
  try {
    const { token } = req.params;
    const userId = req.user.userId;
    
    // Find invite
    const invite = await db.query.householdInvites.findFirst({
      where: eq(householdInvites.token, token),
    });
    
    if (!invite) {
      return res.status(404).json({ error: "Invite not found" });
    }
    
    if (invite.acceptedAt) {
      return res.status(400).json({ error: "Invite already accepted" });
    }
    
    if (new Date() > invite.expiresAt) {
      return res.status(400).json({ error: "Invite expired" });
    }
    
    // Create user profile
    await db.insert(userProfiles).values({
      userId,
      householdId: invite.householdId,
      role: invite.role,
    });
    
    // Mark invite as accepted
    await db.update(householdInvites)
      .set({ 
        acceptedAt: new Date(), 
        acceptedBy: userId 
      })
      .where(eq(householdInvites.id, invite.id));
    
    res.json({ 
      success: true, 
      householdId: invite.householdId 
    });
  } catch (error) {
    console.error("Error accepting invite:", error);
    res.status(500).json({ error: "Failed to accept invite" });
  }
});

// List household members
router.get("/:householdId/members", async (req: any, res) => {
  try {
    const { householdId } = req.params;
    const userId = req.user.userId;
    
    // Verify access
    const hasAccess = await db.query.userProfiles.findFirst({
      where: and(
        eq(userProfiles.userId, userId),
        eq(userProfiles.householdId, householdId)
      ),
    });
    
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    // Get all members
    const members = await db.query.userProfiles.findMany({
      where: eq(userProfiles.householdId, householdId),
    });
    
    res.json(members);
  } catch (error) {
    console.error("Error fetching members:", error);
    res.status(500).json({ error: "Failed to fetch members" });
  }
});

// Remove member
router.delete("/:householdId/members/:memberId", async (req: any, res) => {
  try {
    const { householdId, memberId } = req.params;
    const userId = req.user.userId;
    
    // Verify permission
    const profile = await db.query.userProfiles.findFirst({
      where: and(
        eq(userProfiles.userId, userId),
        eq(userProfiles.householdId, householdId)
      ),
    });
    
    if (!profile || (profile.role !== "ASSISTANT" && profile.role !== "OWNER")) {
      return res.status(403).json({ error: "Permission denied" });
    }
    
    // Remove member
    await db.delete(userProfiles)
      .where(and(
        eq(userProfiles.userId, memberId),
        eq(userProfiles.householdId, householdId)
      ));
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error removing member:", error);
    res.status(500).json({ error: "Failed to remove member" });
  }
});

export default router;
```

---

### Step 5.3: Add Invite Routes to Server

**Update: `server/routes.ts`**

```typescript
import inviteRoutes from "./routes/invites";

app.use("/api/households", isAuthenticated, inviteRoutes);
```

---

### Step 5.4: Add Invite Email Template

**Update: `server/services/notifications.ts`**

```typescript
export async function sendInviteEmail({ 
  to, 
  householdName, 
  inviteLink, 
  role 
}: { 
  to: string; 
  householdName: string; 
  inviteLink: string; 
  role: string;
}) {
  const subject = `You've been invited to join ${householdName} on hndld`;
  
  const text = `
You've been invited to join ${householdName} as a ${role.toLowerCase()}.

Click the link below to accept:
${inviteLink}

This invite expires in 7 days.
  `.trim();
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Inter, sans-serif; color: #1A1D2E; background: #F8F6F3; }
    .container { max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; padding: 32px; }
    .button { display: inline-block; background: #1E3A5F; color: #FFFFFF; padding: 12px 32px; border-radius: 12px; text-decoration: none; font-weight: 500; }
  </style>
</head>
<body>
  <div class="container">
    <h1>You're Invited!</h1>
    <p>You've been invited to join <strong>${householdName}</strong> as a <strong>${role.toLowerCase()}</strong>.</p>
    <p><a href="${inviteLink}" class="button">Accept Invitation</a></p>
    <p style="color: #718096; font-size: 14px; margin-top: 32px;">
      This invite expires in 7 days.<br/>
      If you didn't expect this invitation, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
  `.trim();
  
  return sendEmail({ to, subject, text, html });
}
```

---

### Step 5.5: Add Join Page

**Create: `client/src/pages/join-household.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function JoinHousehold() {
  const [, params] = useRoute("/join/:token");
  const token = params?.token;
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const acceptMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/households/join/${token}`);
    },
    onSuccess: (data) => {
      setStatus("success");
      // Redirect to household after 2 seconds
      setTimeout(() => {
        localStorage.setItem("activeHouseholdId", data.householdId);
        window.location.href = "/";
      }, 2000);
    },
    onError: () => {
      setStatus("error");
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Join Household</CardTitle>
          <CardDescription>
            You've been invited to join a household on hndld
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "idle" && (
            <>
              <p className="text-sm text-muted-foreground">
                Click the button below to accept this invitation and join the household.
              </p>
              <Button 
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
                className="w-full"
              >
                {acceptMutation.isPending ? "Accepting..." : "Accept Invitation"}
              </Button>
            </>
          )}
          
          {status === "success" && (
            <Alert>
              <CheckCircle className="h-4 w-4 text-success" />
              <AlertDescription>
                Successfully joined! Redirecting...
              </AlertDescription>
            </Alert>
          )}
          
          {status === "error" && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to accept invitation. The link may be expired or invalid.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Add route to your router**

---

## 🎯 TESTING CHECKLIST

After implementing all changes, test:

### Multi-Household Switching
- [ ] Can view list of households user has access to
- [ ] Can switch between households
- [ ] Data changes when switching households
- [ ] Household switcher appears for assistants only
- [ ] APIs respect X-Household-Id header

### Onboarding
- [ ] Can complete all onboarding phases
- [ ] Data saves correctly to household
- [ ] No 404 errors on missing endpoints

### Vault
- [ ] Can set vault PIN
- [ ] Can unlock vault with correct PIN
- [ ] Access items are masked by default
- [ ] Can reveal individual items after unlock
- [ ] Vault auto-locks after 5 minutes
- [ ] Audit log records vault access

### Google Calendar
- [ ] Can initiate OAuth flow
- [ ] OAuth callback redirects correctly
- [ ] Can see list of Google calendars
- [ ] Can select calendars to sync
- [ ] Events sync automatically every 15 minutes
- [ ] Can manually trigger sync

### Household Invites
- [ ] Can send invite email
- [ ] Invite link works
- [ ] Can accept invite
- [ ] New member appears in household
- [ ] Can remove members
- [ ] Expired invites don't work

---

## 🚀 DEPLOYMENT NOTES

1. **Environment Variables Required:**
```
DATABASE_URL=postgresql://...
SESSION_SECRET=...
ENCRYPTION_KEY=... (32 chars)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://your-app.com/api/google/callback
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=...
FROM_EMAIL=noreply@hndld.app
APP_URL=https://your-app.com
```

2. **Run Migrations:**
```bash
npm run db:push
```

3. **Test Locally First:**
- Multi-household switching
- Onboarding flow
- Vault PIN setup
- Google OAuth (use localhost redirect for testing)

4. **Production Checklist:**
- [ ] All environment variables set
- [ ] Google OAuth redirect URI matches production URL
- [ ] Email sending works
- [ ] Database migrations applied
- [ ] Cron jobs running

---

## 📝 SUMMARY

This prompt fixes the **3 critical blockers** and adds **2 high-impact features**:

✅ **Multi-household switching** - Full implementation (8h)
✅ **Fix onboarding endpoints** - Proxy routes added (2h)
✅ **Real vault security** - PIN-based unlock system (6h)
✅ **Google Calendar OAuth** - Full integration (10h)
✅ **Household invites** - Token-based invite system (8h)

**Total: 34 hours of work**

After these changes, your app will be **production-ready** for professional concierge services managing multiple households.
