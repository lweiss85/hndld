/**
 * HTML escape utility to prevent XSS attacks
 * Use this for any user-controlled content inserted into HTML
 */

const htmlEscapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

/**
 * Escapes HTML special characters to prevent XSS
 * @param str - The string to escape
 * @returns The escaped string safe for HTML insertion
 */
export function escapeHtml(str: string | null | undefined): string {
  if (str == null) return '';
  return String(str).replace(/[&<>"'`=/]/g, (char) => htmlEscapeMap[char] || char);
}

/**
 * Escapes an array of strings
 */
export function escapeHtmlArray(arr: string[] | null | undefined): string[] {
  if (!arr) return [];
  return arr.map(escapeHtml);
}
