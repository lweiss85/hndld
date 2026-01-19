export type AppMode = "HNDLD" | "GLNT";

export const APP_MODE: AppMode = "HNDLD";

export const APP_CONFIG = {
  HNDLD: {
    name: "hndld",
    tagline: "Household Operations",
    defaultServiceType: null,
    showPAService: true,
    showCleaningService: true,
    primaryColor: "#1D2A44",
  },
  GLNT: {
    name: "GLNT",
    tagline: "Cleaning Concierge",
    defaultServiceType: "CLEANING" as const,
    showPAService: false,
    showCleaningService: true,
    primaryColor: "#1D2A44",
  },
};

export function getAppConfig() {
  return APP_CONFIG[APP_MODE];
}
