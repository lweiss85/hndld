import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock } from "lucide-react";

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
      const response = await apiRequest("POST", "/api/vault/verify-pin", { pin });
      const result = await response.json();
      
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
              data-testid="input-vault-pin"
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
            data-testid="button-vault-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleVerify}
            disabled={pin.length < 4 || isVerifying}
            className="flex-1"
            data-testid="button-vault-unlock"
          >
            {isVerifying ? "Verifying..." : "Unlock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [vaultSession, setVaultSession] = useState<VaultSession | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

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
    if (vaultSession && Date.now() < vaultSession.expiresAt) {
      return Promise.resolve(true);
    }
    
    return new Promise<boolean>((resolve) => {
      setResolvePromise(() => resolve);
      setShowUnlockModal(true);
    });
  }, [vaultSession]);

  const handleUnlock = useCallback((success: boolean) => {
    if (success) {
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
