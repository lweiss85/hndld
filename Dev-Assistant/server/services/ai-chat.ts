import { generateCompletion, isDemoMode, getActiveProvider } from "./ai-provider";
import { storage } from "../storage";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface HouseholdContext {
  tasks: Array<{ title: string; status: string; dueAt?: Date | null }>;
  events: Array<{ title: string; startAt: Date }>;
  pendingApprovals: number;
  pendingRequests: number;
  recentUpdates: Array<{ text: string }>;
}

export async function getHouseholdContext(householdId: string): Promise<HouseholdContext> {
  const [tasks, events, approvals, requests, updates] = await Promise.all([
    storage.getTasks(householdId),
    storage.getCalendarEvents(householdId),
    storage.getApprovals(householdId),
    storage.getRequests(householdId),
    storage.getUpdates(householdId),
  ]);

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return {
    tasks: tasks
      .filter(t => t.status !== "DONE")
      .slice(0, 10)
      .map(t => ({ title: t.title, status: t.status!, dueAt: t.dueAt })),
    events: events
      .filter(e => e.startAt && new Date(e.startAt) >= now && new Date(e.startAt) <= weekFromNow)
      .slice(0, 10)
      .map(e => ({ title: e.title, startAt: new Date(e.startAt!) })),
    pendingApprovals: approvals.filter(a => a.status === "PENDING").length,
    pendingRequests: requests.filter(r => (r as any).status === "PENDING").length,
    recentUpdates: updates.slice(0, 3).map(u => ({ text: u.text.slice(0, 100) })),
  };
}

export async function chat(
  messages: ChatMessage[],
  householdId: string
): Promise<string> {
  const provider = getActiveProvider();
  if (provider === "NONE") {
    return getDemoResponse(messages[messages.length - 1]?.content || "");
  }

  const context = await getHouseholdContext(householdId);
  
  const systemPrompt = `You are a helpful household assistant for hndld, a premium household management app. You help busy families and their household assistants stay organized.

Current household context:
- ${context.tasks.length} active tasks${context.tasks.length > 0 ? `: ${context.tasks.slice(0, 3).map(t => t.title).join(", ")}` : ""}
- ${context.events.length} events this week${context.events.length > 0 ? `: ${context.events.slice(0, 3).map(e => e.title).join(", ")}` : ""}
- ${context.pendingApprovals} pending approvals
- ${context.pendingRequests} pending requests

Guidelines:
- Be warm, professional, and concise
- Reference specific household data when relevant
- Suggest actions the user can take in the app
- Keep responses under 150 words unless detail is requested`;

  try {
    return await generateCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      maxTokens: 500,
      temperature: 0.7,
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return "I'm having trouble connecting right now. Please try again in a moment.";
  }
}

function getDemoResponse(userMessage: string): string {
  const lowerMessage = userMessage.toLowerCase();
  
  if (lowerMessage.includes("schedule") || lowerMessage.includes("calendar") || lowerMessage.includes("event")) {
    return "I can help you with your schedule! You have a few events coming up this week. Check the Calendar tab for full details.";
  }
  
  if (lowerMessage.includes("task") || lowerMessage.includes("todo") || lowerMessage.includes("to do")) {
    return "Looking at your tasks! You have several items in progress. Head to the Tasks tab to see what's pending.";
  }
  
  if (lowerMessage.includes("approval") || lowerMessage.includes("approve")) {
    return "You can review pending approvals in the Approvals tab. Each item shows the details and amount for your review.";
  }
  
  if (lowerMessage.includes("spending") || lowerMessage.includes("money") || lowerMessage.includes("expense")) {
    return "Your spending summary is available in the Money tab. You can track expenses and manage invoices there.";
  }
  
  if (lowerMessage.includes("help") || lowerMessage.includes("what can you")) {
    return "I can help you with tasks, scheduling, approvals, spending tracking, and general household questions. Just ask!";
  }
  
  return "I'm here to help with your household management. Ask me about tasks, scheduling, approvals, or anything else you need help with.";
}

export async function parseNaturalLanguageRequest(
  text: string,
  context?: { familyMembers?: string[]; frequentLocations?: string[] }
): Promise<{
  title: string;
  description?: string;
  category: string;
  urgency: string;
  suggestedDueDate?: string;
  location?: string;
  confidence: number;
}> {
  const provider = getActiveProvider();
  if (provider === "NONE") {
    return quickParseRequest(text);
  }

  const prompt = `Parse this household request and extract structured data.

Request: "${text}"

${context?.familyMembers?.length ? `Family members: ${context.familyMembers.join(", ")}` : ""}
${context?.frequentLocations?.length ? `Frequent locations: ${context.frequentLocations.join(", ")}` : ""}

Extract:
- title: A concise title (max 60 chars)
- description: Optional additional details
- category: One of HOUSEHOLD, ERRANDS, MAINTENANCE, GROCERIES, KIDS, PETS, EVENTS, OTHER
- urgency: One of LOW, MEDIUM, HIGH
- suggestedDueDate: ISO date string if mentioned (e.g., "tomorrow" = next day's date), null otherwise
- location: If mentioned
- confidence: 0.0 to 1.0 based on how well you understood the request

Return ONLY valid JSON, no explanation.`;

  try {
    const result = await generateCompletion({
      messages: [
        { role: "system", content: "You are a JSON parser for household management requests. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      maxTokens: 500,
      temperature: 0.3,
    });

    const parsed = JSON.parse(result);
    return {
      title: parsed.title || text.slice(0, 60),
      description: parsed.description,
      category: parsed.category || "OTHER",
      urgency: parsed.urgency || "MEDIUM",
      suggestedDueDate: parsed.suggestedDueDate,
      location: parsed.location,
      confidence: parsed.confidence || 0.7,
    };
  } catch {
    return quickParseRequest(text);
  }
}

export function quickParseRequest(text: string): {
  title: string;
  description?: string;
  category: string;
  urgency: string;
  suggestedDueDate?: string;
  confidence: number;
} {
  const lowerText = text.toLowerCase();
  
  let category = "OTHER";
  if (lowerText.includes("grocery") || lowerText.includes("groceries") || lowerText.includes("food") || lowerText.includes("shopping")) {
    category = "GROCERIES";
  } else if (lowerText.includes("kid") || lowerText.includes("child") || lowerText.includes("school") || lowerText.includes("soccer") || lowerText.includes("practice")) {
    category = "KIDS";
  } else if (lowerText.includes("pet") || lowerText.includes("dog") || lowerText.includes("cat") || lowerText.includes("vet")) {
    category = "PETS";
  } else if (lowerText.includes("repair") || lowerText.includes("fix") || lowerText.includes("plumb") || lowerText.includes("electric") || lowerText.includes("hvac")) {
    category = "MAINTENANCE";
  } else if (lowerText.includes("errand") || lowerText.includes("pick up") || lowerText.includes("drop off") || lowerText.includes("dry clean")) {
    category = "ERRANDS";
  } else if (lowerText.includes("party") || lowerText.includes("event") || lowerText.includes("birthday") || lowerText.includes("dinner")) {
    category = "EVENTS";
  } else if (lowerText.includes("clean") || lowerText.includes("laundry") || lowerText.includes("house")) {
    category = "HOUSEHOLD";
  }

  let urgency = "MEDIUM";
  if (lowerText.includes("urgent") || lowerText.includes("asap") || lowerText.includes("emergency") || lowerText.includes("immediately")) {
    urgency = "HIGH";
  } else if (lowerText.includes("whenever") || lowerText.includes("no rush") || lowerText.includes("low priority")) {
    urgency = "LOW";
  }

  let suggestedDueDate: string | undefined;
  const now = new Date();
  if (lowerText.includes("today")) {
    suggestedDueDate = now.toISOString();
  } else if (lowerText.includes("tomorrow")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    suggestedDueDate = tomorrow.toISOString();
  } else if (lowerText.includes("this week")) {
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    suggestedDueDate = endOfWeek.toISOString();
  }

  return {
    title: text.slice(0, 60),
    category,
    urgency,
    suggestedDueDate,
    confidence: 0.5,
  };
}
