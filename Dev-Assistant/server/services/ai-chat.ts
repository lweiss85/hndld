import { generateCompletion, isDemoMode, getActiveProvider } from "./ai-provider";
import { storage } from "../storage";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface HouseholdContext {
  tasks: Array<{ title: string; status: string; category?: string; dueAt?: Date | null }>;
  events: Array<{ title: string; startAt: Date }>;
  requests: Array<{ title: string; description?: string; category: string; createdAt: Date }>;
  approvals: Array<{ title: string; amount?: number; status: string }>;
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
      .map(t => ({ title: t.title, status: t.status!, category: t.category || undefined, dueAt: t.dueAt })),
    events: events
      .filter(e => e.startAt && new Date(e.startAt) >= now && new Date(e.startAt) <= weekFromNow)
      .slice(0, 10)
      .map(e => ({ title: e.title, startAt: new Date(e.startAt!) })),
    requests: requests
      .slice(0, 10)
      .map(r => ({ 
        title: r.title, 
        description: r.description || undefined, 
        category: r.category || "OTHER",
        createdAt: new Date(r.createdAt!)
      })),
    approvals: approvals
      .slice(0, 10)
      .map(a => ({ 
        title: a.title, 
        amount: a.amount ? Number(a.amount) : undefined, 
        status: a.status || "PENDING" 
      })),
    pendingApprovals: approvals.filter(a => a.status === "PENDING").length,
    pendingRequests: requests.length,
    recentUpdates: updates.slice(0, 3).map(u => ({ text: u.text.slice(0, 100) })),
  };
}

export async function chat(
  messages: ChatMessage[],
  householdId: string
): Promise<string> {
  const provider = getActiveProvider();
  if (provider === "NONE") {
    return getSmartDemoResponse(messages[messages.length - 1]?.content || "", householdId);
  }

  const context = await getHouseholdContext(householdId);
  
  const taskDetails = context.tasks.map(t => {
    const dueInfo = t.dueAt ? ` (due: ${new Date(t.dueAt).toLocaleDateString()})` : "";
    const catInfo = t.category ? ` [${t.category}]` : "";
    return `• ${t.title}${catInfo} - ${t.status}${dueInfo}`;
  }).join("\n");

  const eventDetails = context.events.map(e => {
    const date = new Date(e.startAt);
    return `• ${e.title} - ${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }).join("\n");

  const requestDetails = context.requests.map(r => {
    const date = new Date(r.createdAt);
    return `• ${r.title} [${r.category}] - requested ${date.toLocaleDateString()}${r.description ? `: ${r.description}` : ""}`;
  }).join("\n");

  const approvalDetails = context.approvals.map(a => {
    const amountInfo = a.amount ? ` - $${a.amount}` : "";
    return `• ${a.title}${amountInfo} [${a.status}]`;
  }).join("\n");

  const systemPrompt = `You are a knowledgeable household assistant for hndld. You have FULL ACCESS to the household's data and should DIRECTLY ANSWER questions with specific information.

CURRENT HOUSEHOLD DATA:

TASKS (${context.tasks.length} active):
${taskDetails || "No active tasks"}

REQUESTS SUBMITTED (${context.requests.length}):
${requestDetails || "No requests"}

APPROVALS (${context.approvals.length}):
${approvalDetails || "No approvals"}

UPCOMING EVENTS (${context.events.length} this week):
${eventDetails || "No events this week"}

RECENT UPDATES:
${context.recentUpdates.map(u => `• ${u.text}`).join("\n") || "No recent updates"}

CRITICAL GUIDELINES:
1. DIRECTLY ANSWER with specific data - DO NOT tell users to "check the app" or "go to a tab"
2. When asked about requests, search the REQUESTS list above and tell them exactly what they've requested
3. When asked about tasks, list the actual tasks with their status and due dates
4. When asked about groceries, check both REQUESTS and TASKS for grocery-related items
5. When asked about approvals, give the actual approval titles and amounts
6. If information isn't in the data above, say so honestly
7. After answering, you may briefly mention where to take action
8. Be warm, professional, and specific
9. Keep responses concise but complete`;

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

async function getSmartDemoResponse(userMessage: string, householdId: string): Promise<string> {
  const lowerMessage = userMessage.toLowerCase();
  const context = await getHouseholdContext(householdId);
  
  // Check for grocery-related queries first (common question)
  if (lowerMessage.includes("grocer")) {
    const groceryRequests = context.requests.filter(r => 
      r.category === "GROCERIES" || r.title.toLowerCase().includes("grocer")
    );
    const groceryTasks = context.tasks.filter(t => 
      t.category === "GROCERIES" || t.title.toLowerCase().includes("grocer")
    );
    
    const results = [];
    if (groceryRequests.length > 0) {
      results.push(`Requests:\n${groceryRequests.map(r => `• ${r.title} - requested ${new Date(r.createdAt).toLocaleDateString()}`).join("\n")}`);
    }
    if (groceryTasks.length > 0) {
      results.push(`Tasks:\n${groceryTasks.map(t => {
        const dueInfo = t.dueAt ? ` (due: ${new Date(t.dueAt).toLocaleDateString()})` : "";
        return `• ${t.title} [${t.status}]${dueInfo}`;
      }).join("\n")}`);
    }
    
    if (results.length > 0) {
      return `Here's what I found for groceries:\n\n${results.join("\n\n")}`;
    }
    return "I don't see any grocery-related requests or tasks right now.";
  }
  
  // Check for request-related queries
  if (lowerMessage.includes("request")) {
    if (context.requests.length === 0) {
      return "You don't have any requests submitted right now.";
    }
    const requestList = context.requests.slice(0, 5).map(r => {
      const date = new Date(r.createdAt);
      return `• ${r.title} [${r.category}] - ${date.toLocaleDateString()}`;
    }).join("\n");
    return `Here are your requests:\n\n${requestList}${context.requests.length > 5 ? `\n\n...and ${context.requests.length - 5} more.` : ""}`;
  }
  
  if (lowerMessage.includes("schedule") || lowerMessage.includes("calendar") || lowerMessage.includes("event")) {
    if (context.events.length === 0) {
      return "You don't have any events scheduled this week. Would you like to add something to the calendar?";
    }
    const eventList = context.events.slice(0, 5).map(e => {
      const date = new Date(e.startAt);
      return `• ${e.title} - ${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }).join("\n");
    return `Here are your upcoming events:\n\n${eventList}${context.events.length > 5 ? `\n\n...and ${context.events.length - 5} more in your Calendar.` : ""}`;
  }
  
  if (lowerMessage.includes("task") || lowerMessage.includes("todo") || lowerMessage.includes("to do") || (lowerMessage.includes("what") && lowerMessage.includes("do"))) {
    if (context.tasks.length === 0) {
      return "Great news - you don't have any active tasks right now!";
    }
    const taskList = context.tasks.slice(0, 5).map(t => {
      const dueInfo = t.dueAt ? ` (due: ${new Date(t.dueAt).toLocaleDateString()})` : "";
      return `• ${t.title} [${t.status}]${dueInfo}`;
    }).join("\n");
    return `Here are your active tasks:\n\n${taskList}${context.tasks.length > 5 ? `\n\n...and ${context.tasks.length - 5} more in your Tasks list.` : ""}`;
  }
  
  if (lowerMessage.includes("approval") || lowerMessage.includes("approve")) {
    if (context.approvals.length === 0) {
      return "No pending approvals right now - all caught up!";
    }
    const approvalList = context.approvals.filter(a => a.status === "PENDING").slice(0, 5).map(a => {
      const amountInfo = a.amount ? ` - $${a.amount}` : "";
      return `• ${a.title}${amountInfo}`;
    }).join("\n");
    if (!approvalList) {
      return "No pending approvals right now - all caught up!";
    }
    return `Here are your pending approvals:\n\n${approvalList}`;
  }
  
  if (lowerMessage.includes("spending") || lowerMessage.includes("money") || lowerMessage.includes("expense")) {
    return "I can see your spending data. For detailed amounts and categories, check the Pay section where you'll find invoices and expense breakdowns.";
  }
  
  if (lowerMessage.includes("help") || lowerMessage.includes("what can you")) {
    return "I can tell you about your tasks, requests, upcoming events, pending approvals, and household updates. Just ask me something specific like 'What tasks do I have?', 'Did I request groceries?', or 'What's on my calendar?'";
  }
  
  const summary = [];
  if (context.tasks.length > 0) summary.push(`${context.tasks.length} active task${context.tasks.length > 1 ? "s" : ""}`);
  if (context.requests.length > 0) summary.push(`${context.requests.length} request${context.requests.length > 1 ? "s" : ""}`);
  if (context.events.length > 0) summary.push(`${context.events.length} event${context.events.length > 1 ? "s" : ""} this week`);
  if (context.pendingApprovals > 0) summary.push(`${context.pendingApprovals} pending approval${context.pendingApprovals > 1 ? "s" : ""}`);
  
  if (summary.length > 0) {
    return `Here's a quick overview: You have ${summary.join(", ")}. What would you like to know more about?`;
  }
  
  return "Everything looks caught up! No pending tasks, events, or approvals. How can I help you today?";
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
