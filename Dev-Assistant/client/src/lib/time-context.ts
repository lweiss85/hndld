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
      skyColor: "#FDF8F0",
      accentColor: "#C9A96E",
      glowColor: "rgba(201,169,110,0.15)",
    };
  }

  if (hour >= 12 && hour <= 16) {
    return {
      phase: "afternoon",
      skyColor: "#F5F8FA",
      accentColor: "#7B9EA8",
      glowColor: "rgba(123,158,168,0.10)",
    };
  }

  if (hour >= 17 && hour <= 20) {
    return {
      phase: "evening",
      skyColor: "#F8F4EE",
      accentColor: "#C9A96E",
      glowColor: "rgba(201,169,110,0.18)",
    };
  }

  return {
    phase: "night",
    skyColor: "#F2F1F5",
    accentColor: "#8B8FA8",
    glowColor: "rgba(139,143,168,0.12)",
  };
}
