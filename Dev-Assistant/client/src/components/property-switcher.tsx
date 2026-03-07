import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IconHome } from "@/components/icons/hndld-icons";

interface PropertyOption {
  id: string;
  name: string;
  type: string;
  isPrimary: boolean;
}

interface PropertyContextType {
  selectedPropertyId: string | null;
  setSelectedPropertyId: (id: string | null) => void;
  properties: PropertyOption[];
}

const PropertyContext = createContext<PropertyContextType>({
  selectedPropertyId: null,
  setSelectedPropertyId: () => {},
  properties: [],
});

export function usePropertyContext() {
  return useContext(PropertyContext);
}

export function PropertyProvider({ children }: { children: ReactNode }) {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("hndld_selected_property") || null;
    } catch {
      return null;
    }
  });

  const { data } = useQuery<{ properties: PropertyOption[] }>({
    queryKey: ["/api/v1/properties"],
    staleTime: 60000,
  });

  const properties = data?.properties || [];

  useEffect(() => {
    try {
      if (selectedPropertyId) {
        localStorage.setItem("hndld_selected_property", selectedPropertyId);
      } else {
        localStorage.removeItem("hndld_selected_property");
      }
    } catch {}
  }, [selectedPropertyId]);

  return (
    <PropertyContext.Provider value={{ selectedPropertyId, setSelectedPropertyId, properties }}>
      {children}
    </PropertyContext.Provider>
  );
}

export function PropertySwitcher() {
  const { selectedPropertyId, setSelectedPropertyId, properties } = usePropertyContext();

  if (properties.length <= 1) return null;

  return (
    <Select
      value={selectedPropertyId || "all"}
      onValueChange={(v) => setSelectedPropertyId(v === "all" ? null : v)}
    >
      <SelectTrigger className="h-8 text-xs w-auto min-w-[140px] gap-1.5 border-border/50">
        <IconHome size={14} className="text-muted-foreground shrink-0" />
        <SelectValue placeholder="All Properties" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">
          <span className="flex items-center gap-1.5">
            <IconHome size={14} /> All Properties
          </span>
        </SelectItem>
        {properties.map(p => (
          <SelectItem key={p.id} value={p.id}>
            <span className="flex items-center gap-1.5">
              <IconHome size={14} /> {p.name}
              {p.isPrimary && <span className="text-[10px] text-amber-600">(Primary)</span>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
