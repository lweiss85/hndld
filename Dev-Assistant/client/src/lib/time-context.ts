export interface TimeContext {
  phase: string;
  accentColor: string;
  skyColor: string;
  glowColor: string;
}

export function getTimeContext(): TimeContext {
  const hour = new Date().getHours();

  if (hour >= 5 && hour <= 11) {
    return {
      phase: "morning",
      skyColor: "#FBF5EB",
      accentColor: "#C9A96E",
      glowColor: "rgba(201,169,110,0.22)",
    };
  }

  if (hour >= 12 && hour <= 16) {
    return {
      phase: "afternoon",
      skyColor: "#F4F6F8",
      accentColor: "#7B9EA8",
      glowColor: "rgba(123,158,168,0.14)",
    };
  }

  if (hour >= 17 && hour <= 20) {
    return {
      phase: "evening",
      skyColor: "#F6F0E6",
      accentColor: "#D4A55A",
      glowColor: "rgba(212,165,90,0.25)",
    };
  }

  return {
    phase: "night",
    skyColor: "#EEEDF3",
    accentColor: "#8B8FA8",
    glowColor: "rgba(139,143,168,0.15)",
  };
}
