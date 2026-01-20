import { generateCompletion, isDemoMode, getActiveProvider } from "./ai-provider";
import { storage } from "../storage";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  response: string;
  action?: {
    type: "create_request";
    data: {
      title: string;
      description?: string;
      category: string;
      urgency: string;
    };
    confirmMessage: string;
  };
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

function detectRequestIntent(message: string): boolean {
  const lower = message.toLowerCase();
  
  // Explicit creation requests - these always count, even with question marks
  const explicitCreatePatterns = [
    /create a (request|task|reminder)/,
    /add a (request|task|reminder)/,
    /make a (request|task|reminder)/,
    /submit a (request|task)/,
    /can you (create|add|make|submit|schedule|book|arrange|set up)/,
    /could you (create|add|make|submit|schedule|book|arrange|set up)/,
    /would you (create|add|make|submit|schedule|book|arrange|set up)/,
    /please (create|add|make|submit|schedule|book|arrange|set up)/,
    /i('d| would) like (to |you to )?(create|add|make|schedule|book|arrange)/,
  ];
  
  if (explicitCreatePatterns.some(p => p.test(lower))) {
    return true;
  }
  
  // Implicit action requests (need, want, etc.) - exclude actual questions
  const actionWords = ["need", "want", "get", "book", "schedule", "order", "arrange", "hire", "find", "call", "pick up", "buy", "fix", "clean", "organize"];
  const hasActionWord = actionWords.some(w => lower.includes(w));
  
  // These are inquiry questions, not action requests
  const isInquiry = lower.startsWith("do i ") || lower.startsWith("did i ") || lower.startsWith("have i ") || lower.startsWith("what ") || lower.startsWith("how ") || lower.startsWith("when ");
  
  return hasActionWord && !isInquiry;
}

async function parseRequestFromMessage(message: string): Promise<{ title: string; description?: string; category: string; urgency: string } | null> {
  const provider = getActiveProvider();
  
  if (provider === "NONE") {
    return quickParseRequestFromChat(message);
  }
  
  try {
    const result = await generateCompletion({
      messages: [
        { role: "system", content: `You extract request details from natural language. Return ONLY valid JSON with these fields:
- title: A clear, concise title for the request (max 60 chars)
- description: Optional additional details
- category: One of HOUSEHOLD, ERRANDS, MAINTENANCE, GROCERIES, KIDS, PETS, EVENTS, OTHER
- urgency: One of LOW, MEDIUM, HIGH

If this doesn't seem like a request for help/action, return {"isRequest": false}` },
        { role: "user", content: message }
      ],
      maxTokens: 200,
      temperature: 0.3,
    });
    
    const parsed = JSON.parse(result);
    if (parsed.isRequest === false) return null;
    
    return {
      title: parsed.title || message.slice(0, 60),
      description: parsed.description,
      category: parsed.category || "OTHER",
      urgency: parsed.urgency || "MEDIUM"
    };
  } catch {
    return quickParseRequestFromChat(message);
  }
}

function quickParseRequestFromChat(message: string): { title: string; description?: string; category: string; urgency: string } | null {
  const lower = message.toLowerCase();
  
  let category = "OTHER";
  if (lower.includes("grocer") || lower.includes("food") || lower.includes("shopping")) {
    category = "GROCERIES";
  } else if (lower.includes("kid") || lower.includes("child") || lower.includes("school")) {
    category = "KIDS";
  } else if (lower.includes("pet") || lower.includes("dog") || lower.includes("cat") || lower.includes("vet")) {
    category = "PETS";
  } else if (lower.includes("repair") || lower.includes("fix") || lower.includes("plumb") || lower.includes("hvac")) {
    category = "MAINTENANCE";
  } else if (lower.includes("pick up") || lower.includes("drop off") || lower.includes("dry clean")) {
    category = "ERRANDS";
  } else if (lower.includes("party") || lower.includes("event") || lower.includes("birthday") || lower.includes("dinner")) {
    category = "EVENTS";
  } else if (lower.includes("clean") || lower.includes("laundry") || lower.includes("house")) {
    category = "HOUSEHOLD";
  }
  
  let urgency = "MEDIUM";
  if (lower.includes("urgent") || lower.includes("asap") || lower.includes("emergency") || lower.includes("today")) {
    urgency = "HIGH";
  } else if (lower.includes("whenever") || lower.includes("no rush") || lower.includes("when you can")) {
    urgency = "LOW";
  }
  
  const title = message.replace(/^(i need|i want|can you|please|help me|could you|would you)\s*/i, "").slice(0, 60);
  
  return { title, category, urgency };
}

export async function chat(
  messages: ChatMessage[],
  householdId: string
): Promise<ChatResponse> {
  const lastMessage = messages[messages.length - 1]?.content || "";
  const provider = getActiveProvider();
  
  // Check if user wants to create a request
  if (detectRequestIntent(lastMessage)) {
    const requestData = await parseRequestFromMessage(lastMessage);
    
    if (requestData) {
      const categoryNatural = requestData.category.toLowerCase().replace("_", " ");
      const urgencyNatural = requestData.urgency === "HIGH" ? "urgent" : requestData.urgency === "LOW" ? "low priority" : "normal priority";
      
      return {
        response: `Got it! I'll create a ${categoryNatural} request for "${requestData.title}" (${urgencyNatural}). Should I submit this for you?`,
        action: {
          type: "create_request",
          data: requestData,
          confirmMessage: `Great, I've submitted your request for "${requestData.title}". Your assistant will see it right away!`
        }
      };
    }
  }
  
  // Regular chat flow
  if (provider === "NONE") {
    const response = await getSmartDemoResponse(lastMessage, householdId);
    return { response };
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
    const response = await generateCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      maxTokens: 500,
      temperature: 0.7,
    });
    return { response };
  } catch (error) {
    console.error("AI chat error:", error);
    return { response: "I'm having trouble connecting right now. Please try again in a moment." };
  }
}

function formatStatusNaturally(status: string): string {
  const statusMap: Record<string, string> = {
    "INBOX": "waiting to be started",
    "PLANNED": "planned",
    "IN_PROGRESS": "in progress",
    "WAITING": "waiting on someone",
    "DONE": "completed",
    "PENDING": "pending"
  };
  return statusMap[status] || status.toLowerCase();
}

function formatDateNaturally(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  if (diffDays > 1 && diffDays <= 7) return `in ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
  
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
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
    
    if (groceryRequests.length === 0 && groceryTasks.length === 0) {
      return "I checked your requests and tasks, and I don't see anything related to groceries right now. Would you like to add a grocery request?";
    }
    
    const parts = [];
    if (groceryRequests.length > 0) {
      const reqList = groceryRequests.map(r => 
        `"${r.title}" which you requested ${formatDateNaturally(new Date(r.createdAt))}`
      ).join(", and ");
      parts.push(`You have ${groceryRequests.length === 1 ? "a request for" : "requests for"} ${reqList}`);
    }
    if (groceryTasks.length > 0) {
      const taskList = groceryTasks.map(t => {
        const dueInfo = t.dueAt ? `, due ${formatDateNaturally(new Date(t.dueAt))}` : "";
        return `"${t.title}" which is ${formatStatusNaturally(t.status)}${dueInfo}`;
      }).join(", and ");
      parts.push(`${groceryRequests.length > 0 ? "There's also" : "You have"} ${groceryTasks.length === 1 ? "a task for" : "tasks for"} ${taskList}`);
    }
    
    return parts.join(". ") + ".";
  }
  
  // Check for request-related queries
  if (lowerMessage.includes("request")) {
    if (context.requests.length === 0) {
      return "You haven't submitted any requests yet. If you need something done, just let me know!";
    }
    if (context.requests.length === 1) {
      const r = context.requests[0];
      return `You have one request: "${r.title}" which you submitted ${formatDateNaturally(new Date(r.createdAt))}.`;
    }
    const first3 = context.requests.slice(0, 3).map(r => 
      `"${r.title}" from ${formatDateNaturally(new Date(r.createdAt))}`
    ).join(", ");
    const remaining = context.requests.length > 3 ? `, and ${context.requests.length - 3} more` : "";
    return `You have ${context.requests.length} requests: ${first3}${remaining}.`;
  }
  
  if (lowerMessage.includes("schedule") || lowerMessage.includes("calendar") || lowerMessage.includes("event")) {
    if (context.events.length === 0) {
      return "Your calendar is clear this week! Would you like to schedule something?";
    }
    if (context.events.length === 1) {
      const e = context.events[0];
      const time = new Date(e.startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      return `You have one event coming up: "${e.title}" ${formatDateNaturally(new Date(e.startAt))} at ${time}.`;
    }
    const eventList = context.events.slice(0, 3).map(e => {
      const time = new Date(e.startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      return `"${e.title}" ${formatDateNaturally(new Date(e.startAt))} at ${time}`;
    }).join(", ");
    const remaining = context.events.length > 3 ? `, plus ${context.events.length - 3} more this week` : "";
    return `You have ${context.events.length} events coming up: ${eventList}${remaining}.`;
  }
  
  if (lowerMessage.includes("task") || lowerMessage.includes("todo") || lowerMessage.includes("to do") || (lowerMessage.includes("what") && lowerMessage.includes("do"))) {
    if (context.tasks.length === 0) {
      return "You're all caught up! No active tasks right now.";
    }
    if (context.tasks.length === 1) {
      const t = context.tasks[0];
      const dueInfo = t.dueAt ? `, due ${formatDateNaturally(new Date(t.dueAt))}` : "";
      return `You have one task: "${t.title}" which is ${formatStatusNaturally(t.status)}${dueInfo}.`;
    }
    const taskList = context.tasks.slice(0, 3).map(t => {
      const dueInfo = t.dueAt ? ` (due ${formatDateNaturally(new Date(t.dueAt))})` : "";
      return `"${t.title}" is ${formatStatusNaturally(t.status)}${dueInfo}`;
    }).join(", ");
    const remaining = context.tasks.length > 3 ? `, and ${context.tasks.length - 3} more` : "";
    return `You have ${context.tasks.length} active tasks: ${taskList}${remaining}.`;
  }
  
  if (lowerMessage.includes("approval") || lowerMessage.includes("approve")) {
    const pending = context.approvals.filter(a => a.status === "PENDING");
    if (pending.length === 0) {
      return "All caught up! No approvals waiting for you.";
    }
    if (pending.length === 1) {
      const a = pending[0];
      const amountInfo = a.amount ? ` for $${a.amount}` : "";
      return `There's one item waiting for your approval: "${a.title}"${amountInfo}.`;
    }
    const total = pending.reduce((sum, a) => sum + (a.amount || 0), 0);
    const totalInfo = total > 0 ? ` totaling $${total.toFixed(2)}` : "";
    return `You have ${pending.length} items waiting for your approval${totalInfo}.`;
  }
  
  if (lowerMessage.includes("spending") || lowerMessage.includes("money") || lowerMessage.includes("expense")) {
    return "I can help you track spending! You can find detailed expense breakdowns in the Pay section.";
  }
  
  if (lowerMessage.includes("help") || lowerMessage.includes("what can you")) {
    return "I'm here to help! You can ask me things like \"What's on my calendar?\", \"Do I have any grocery requests?\", or \"What tasks need to be done?\" and I'll give you the details.";
  }
  
  // Natural overview
  const parts = [];
  if (context.tasks.length > 0) {
    parts.push(`${context.tasks.length} task${context.tasks.length > 1 ? "s" : ""} to keep track of`);
  }
  if (context.requests.length > 0) {
    parts.push(`${context.requests.length} request${context.requests.length > 1 ? "s" : ""} submitted`);
  }
  if (context.events.length > 0) {
    parts.push(`${context.events.length} event${context.events.length > 1 ? "s" : ""} this week`);
  }
  if (context.pendingApprovals > 0) {
    parts.push(`${context.pendingApprovals} approval${context.pendingApprovals > 1 ? "s" : ""} waiting`);
  }
  
  if (parts.length > 0) {
    return `Here's what I see: ${parts.join(", ")}. What would you like to know more about?`;
  }
  
  return "Everything's quiet right now - no pending tasks, events, or approvals. How can I help?";
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
