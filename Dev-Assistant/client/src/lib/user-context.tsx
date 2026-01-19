import { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { UserProfile } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";

type UserRole = "ASSISTANT" | "CLIENT" | "STAFF";

interface UserProfileResponse extends UserProfile {
  needsRoleSelection?: boolean;
}

interface UserContextType {
  userProfile: UserProfile | null;
  isLoading: boolean;
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;
  canSwitchRoles: boolean;
  needsRoleSelection: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [activeRole, setActiveRole] = useState<UserRole>("CLIENT");

  const { data: userProfileData, isLoading: profileLoading } = useQuery<UserProfileResponse | null>({
    queryKey: ["/api/user-profile"],
    enabled: !!user,
  });

  const needsRoleSelection = !!(userProfileData as any)?.needsRoleSelection;
  const userProfile = needsRoleSelection ? null : (userProfileData as UserProfile | null);

  useEffect(() => {
    if (userProfile?.role) {
      setActiveRole(userProfile.role as UserRole);
    }
  }, [userProfile]);

  const canSwitchRoles = userProfile?.role === "ASSISTANT";

  return (
    <UserContext.Provider
      value={{
        userProfile: userProfile || null,
        isLoading: authLoading || profileLoading,
        activeRole,
        setActiveRole,
        canSwitchRoles,
        needsRoleSelection,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
