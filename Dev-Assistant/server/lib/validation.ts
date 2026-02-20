import { z } from "zod";
import sanitizeHtml from "sanitize-html";

export function sanitizeString(input: string): string {
  return sanitizeHtml(input.trim(), { allowedTags: [], allowedAttributes: {} });
}

export const emailSchema = z.string().email().max(255);
export const uuidSchema = z.string().uuid();
export const safeStringSchema = z.string().max(1000).transform(sanitizeString);
export const safeTextSchema = z.string().max(10000).transform(sanitizeString);
export const phoneSchema = z.string().regex(/^\+?[\d\s\-().]{7,20}$/).max(20);
export const urlSchema = z.string().url().max(2048);

const SQL_PATTERNS = [
  /(\%27)|(\')|(\-\-)/i,
  /\b(union|select|insert|delete|drop)\b.*\b(from|into|table)\b/i,
  /\b(exec|execute|xp_)\b/i,
  /\/\*.*\*\//,
];

export function detectSqlInjection(input: string): boolean {
  return SQL_PATTERNS.some((p) => p.test(input));
}

const XSS_PATTERNS = [
  /<script\b[^>]*>/i,
  /javascript\s*:/i,
  /on\w+\s*=/i,
  /eval\s*\(/i,
];

export function detectXss(input: string): boolean {
  return XSS_PATTERNS.some((p) => p.test(input));
}

export function validateAndSanitize(input: string, maxLength: number = 1000): { safe: boolean; value: string; threats: string[] } {
  const threats: string[] = [];

  if (detectSqlInjection(input)) threats.push("SQL_INJECTION");
  if (detectXss(input)) threats.push("XSS");

  const sanitized = sanitizeString(input).substring(0, maxLength);

  return {
    safe: threats.length === 0,
    value: sanitized,
    threats,
  };
}
