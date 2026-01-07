import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const activeHouseholdId = localStorage.getItem("activeHouseholdId");
  
  const res = await fetch(url, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(activeHouseholdId ? { "X-Household-Id": activeHouseholdId } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (!res.ok && res.status === 403) {
    localStorage.removeItem("activeHouseholdId");
  }
  
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const activeHouseholdId = localStorage.getItem("activeHouseholdId");
    
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: activeHouseholdId ? { "X-Household-Id": activeHouseholdId } : {},
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }
    
    if (res.status === 403) {
      localStorage.removeItem("activeHouseholdId");
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
