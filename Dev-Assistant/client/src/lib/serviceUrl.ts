export type ServiceType = "CLEANING" | "PA";

export function withServiceType(url: string, serviceType?: ServiceType): string {
  if (!serviceType) return url;
  
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}serviceType=${serviceType}`;
}
