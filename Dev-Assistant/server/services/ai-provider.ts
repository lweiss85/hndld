const DEMO_MODE = !process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY;

export type AIProvider = "ANTHROPIC" | "OPENAI" | "NONE";

interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface AICompletionOptions {
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
}

export function isDemoMode(): boolean {
  return DEMO_MODE;
}

export function getActiveProvider(): AIProvider {
  if (process.env.ANTHROPIC_API_KEY) return "ANTHROPIC";
  if (process.env.OPENAI_API_KEY) return "OPENAI";
  return "NONE";
}

async function callAnthropic(options: AICompletionOptions): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();

  const systemMessage = options.messages.find((m) => m.role === "system");
  const userMessages = options.messages.filter((m) => m.role !== "system");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: options.maxTokens || 1024,
    system: systemMessage?.content || "",
    messages: userMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  const textBlock = response.content.find((block: { type: string }) => block.type === "text") as { type: "text"; text: string } | undefined;
  return textBlock ? textBlock.text : "";
}

async function callOpenAI(options: AICompletionOptions): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI();

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: options.maxTokens || 1024,
    temperature: options.temperature || 0.7,
    messages: options.messages,
  });

  return response.choices[0]?.message?.content || "";
}

export async function generateCompletion(options: AICompletionOptions): Promise<string> {
  const provider = getActiveProvider();

  if (provider === "NONE") {
    return "[AI features require a PRO plan with API keys configured]";
  }

  try {
    if (provider === "ANTHROPIC") {
      return await callAnthropic(options);
    } else {
      return await callOpenAI(options);
    }
  } catch (error) {
    console.error(`AI provider error (${provider}):`, error);
    throw new Error("AI service temporarily unavailable");
  }
}

export async function parseRequest(text: string): Promise<{
  title: string;
  category: string;
  urgency: string;
  dueDate?: string;
  checklist?: string[];
}> {
  if (DEMO_MODE) {
    return {
      title: text.slice(0, 50),
      category: "OTHER",
      urgency: "MEDIUM",
      checklist: [],
    };
  }

  const prompt = `Parse this household request and extract structured data. Return JSON only.

Request: "${text}"

Extract:
- title: A concise title (max 60 chars)
- category: One of HOUSEHOLD, ERRANDS, MAINTENANCE, GROCERIES, KIDS, PETS, EVENTS, OTHER
- urgency: One of LOW, MEDIUM, HIGH
- dueDate: ISO date if mentioned, otherwise null
- checklist: Array of sub-tasks if applicable

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

    return JSON.parse(result);
  } catch {
    return {
      title: text.slice(0, 50),
      category: "OTHER",
      urgency: "MEDIUM",
    };
  }
}

export async function generateWeeklyBrief(
  data: {
    events: Array<{ title: string; startAt: Date }>;
    tasks: Array<{ title: string; category: string; dueAt?: Date | null }>;
    birthdays: Array<{ name: string; date: Date }>;
  }
): Promise<string> {
  if (DEMO_MODE) {
    const eventCount = data.events.length;
    const taskCount = data.tasks.length;
    const birthdayCount = data.birthdays.length;
    
    let summary = `This week: `;
    const parts: string[] = [];
    if (eventCount > 0) parts.push(`${eventCount} event${eventCount > 1 ? "s" : ""}`);
    if (taskCount > 0) parts.push(`${taskCount} task${taskCount > 1 ? "s" : ""}`);
    if (birthdayCount > 0) parts.push(`${birthdayCount} birthday${birthdayCount > 1 ? "s" : ""}`);
    
    return summary + (parts.length > 0 ? parts.join(", ") : "nothing scheduled");
  }

  const prompt = `Generate a friendly, conversational weekly brief for a household.

Events this week: ${JSON.stringify(data.events.map((e) => ({ title: e.title, date: e.startAt })))}
Tasks: ${JSON.stringify(data.tasks.map((t) => ({ title: t.title, category: t.category, due: t.dueAt })))}
Birthdays: ${JSON.stringify(data.birthdays.map((b) => ({ name: b.name, date: b.date })))}

Write a warm, helpful 2-3 sentence summary highlighting the most important items. Be conversational but concise.`;

  return generateCompletion({
    messages: [
      { role: "system", content: "You are a helpful household assistant providing weekly briefings." },
      { role: "user", content: prompt },
    ],
    maxTokens: 300,
    temperature: 0.7,
  });
}

export async function transcribeVoice(audioBase64: string): Promise<string> {
  if (DEMO_MODE) {
    return "[Voice transcription requires PRO plan]";
  }

  const provider = getActiveProvider();

  if (provider === "OPENAI") {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI();
    
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const file = new File([audioBuffer], "audio.webm", { type: "audio/webm" });

    const transcription = await client.audio.transcriptions.create({
      file,
      model: "whisper-1",
    });

    return transcription.text;
  }

  return "[Voice transcription only available with OpenAI]";
}

export async function suggestSmartActions(householdContext: {
  recentTasks: string[];
  lastVendorContact?: { name: string; daysAgo: number };
  upcomingDates: string[];
}): Promise<string[]> {
  if (DEMO_MODE) {
    return [
      "Review your weekly task schedule",
      "Check upcoming calendar events",
      "Update household preferences",
    ];
  }

  const prompt = `Based on this household context, suggest 3 helpful actions.

Recent tasks: ${householdContext.recentTasks.join(", ")}
Last vendor contact: ${householdContext.lastVendorContact ? `${householdContext.lastVendorContact.name} (${householdContext.lastVendorContact.daysAgo} days ago)` : "none"}
Upcoming dates: ${householdContext.upcomingDates.join(", ")}

Return a JSON array of 3 actionable suggestions (strings only).`;

  try {
    const result = await generateCompletion({
      messages: [
        { role: "system", content: "You suggest helpful household management actions. Return only a JSON array of strings." },
        { role: "user", content: prompt },
      ],
      maxTokens: 200,
      temperature: 0.6,
    });

    return JSON.parse(result);
  } catch {
    return [
      "Review your weekly task schedule",
      "Check upcoming calendar events",
      "Update household preferences",
    ];
  }
}

const CATEGORY_DEFAULT_MINUTES: Record<string, number> = {
  HOUSEHOLD: 20,
  ERRANDS: 30,
  MAINTENANCE: 45,
  GROCERIES: 45,
  KIDS: 30,
  PETS: 15,
  EVENTS: 60,
  OTHER: 20,
};

export async function estimateTaskMinutes(
  title: string,
  category?: string,
  description?: string | null
): Promise<{ estimatedMinutes: number; confidence: "low" | "medium" | "high" }> {
  const categoryDefault = CATEGORY_DEFAULT_MINUTES[category || "OTHER"] || 20;

  if (DEMO_MODE) {
    return { estimatedMinutes: categoryDefault, confidence: "low" };
  }

  const prompt = `Estimate how many minutes this household task would take for a professional assistant.

Task: "${title}"
${category ? `Category: ${category}` : ""}
${description ? `Description: ${description}` : ""}

Consider:
- Travel time if applicable
- Setup and cleanup time
- Realistic completion time for a professional

Return ONLY valid JSON with exactly this format:
{"estimatedMinutes": number, "confidence": "low" | "medium" | "high"}

The estimatedMinutes should be between 5 and 240.`;

  try {
    const result = await generateCompletion({
      messages: [
        { role: "system", content: "You estimate task durations for household management. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      maxTokens: 100,
      temperature: 0.3,
    });

    const parsed = JSON.parse(result);
    const minutes = Math.min(240, Math.max(5, parseInt(parsed.estimatedMinutes) || categoryDefault));
    const confidence = ["low", "medium", "high"].includes(parsed.confidence) ? parsed.confidence : "medium";
    
    return { estimatedMinutes: minutes, confidence };
  } catch {
    return { estimatedMinutes: categoryDefault, confidence: "low" };
  }
}
