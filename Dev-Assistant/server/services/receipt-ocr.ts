import logger from "../lib/logger";

export interface ExtractedReceipt {
  vendor?: string;
  date?: string;
  total?: number;
  category?: string;
  items?: Array<{ description: string; amount: number }>;
  taxAmount?: number;
  paymentMethod?: string;
  confidence: number;
}

const DEMO_RECEIPT: ExtractedReceipt = {
  vendor: "Sample Store",
  date: new Date().toISOString().split("T")[0],
  total: 4250,
  category: "Household",
  items: [
    { description: "Item 1", amount: 2500 },
    { description: "Item 2", amount: 1750 },
  ],
  confidence: 0,
};

export async function extractReceiptData(
  imageBuffer: Buffer,
  mimeType: string
): Promise<ExtractedReceipt> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn("[ReceiptOCR] No ANTHROPIC_API_KEY, returning demo data");
    return DEMO_RECEIPT;
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();

    const base64 = imageBuffer.toString("base64");
    const mediaType = mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: `Extract data from this receipt image. Return ONLY a JSON object with these fields:
{
  "vendor": "store/business name",
  "date": "YYYY-MM-DD format",
  "total": total amount in cents (integer, e.g. $42.50 = 4250),
  "category": one of ["Groceries","Household","Utilities","Maintenance","Services","Kids","Pets","Entertainment","Other"],
  "items": [{"description": "item name", "amount": amount in cents}],
  "taxAmount": tax in cents or null,
  "paymentMethod": "CASH" | "CREDIT" | "DEBIT" | "OTHER" or null,
  "confidence": 0.0 to 1.0 how confident you are in the extraction
}
Return ONLY valid JSON, no markdown or explanation.`,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find(
      (block: { type: string }) => block.type === "text"
    ) as { type: "text"; text: string } | undefined;

    if (!textBlock) {
      logger.warn("[ReceiptOCR] No text response from AI");
      return { ...DEMO_RECEIPT, confidence: 0 };
    }

    let jsonText = textBlock.text.trim();
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonText);

    return {
      vendor: parsed.vendor || undefined,
      date: parsed.date || undefined,
      total: typeof parsed.total === "number" ? Math.round(parsed.total) : undefined,
      category: parsed.category || undefined,
      items: Array.isArray(parsed.items) ? parsed.items : undefined,
      taxAmount: typeof parsed.taxAmount === "number" ? Math.round(parsed.taxAmount) : undefined,
      paymentMethod: parsed.paymentMethod || undefined,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    };
  } catch (error) {
    logger.error("[ReceiptOCR] Extraction failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
