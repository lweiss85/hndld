import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function getVaultKey(): Buffer {
  const secret = process.env.VAULT_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("VAULT_ENCRYPTION_KEY or SESSION_SECRET required for vault encryption");
  }
  // Derive a 32-byte key from the secret
  return crypto.scryptSync(secret, "vault-salt-hndld", 32);
}

/**
 * Encrypt a plaintext value for secure storage in the vault
 * @param plaintext - The value to encrypt
 * @returns Encrypted string in format: iv:authTag:ciphertext (all hex encoded)
 */
export function encryptVaultValue(plaintext: string): string {
  const key = getVaultKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encrypted
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt a vault value
 * @param encryptedData - The encrypted string from storage
 * @returns Decrypted plaintext
 */
export function decryptVaultValue(encryptedData: string): string {
  // Handle null/undefined
  if (!encryptedData) {
    return "";
  }

  const key = getVaultKey();
  const parts = encryptedData.split(":");
  
  // If not in encrypted format, return as-is (for migration compatibility)
  if (parts.length !== 3 || parts[0].length !== 32 || parts[1].length !== 32) {
    console.warn("[Vault] Found unencrypted value - consider running migration");
    return encryptedData;
  }

  const [ivHex, authTagHex, encrypted] = parts;
  
  try {
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("[Vault] Decryption failed:", error);
    throw new Error("Failed to decrypt vault value");
  }
}

/**
 * Check if a value is in encrypted format
 * @param value - The value to check
 * @returns true if the value appears to be encrypted
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  // Check if value matches our encryption format (iv:authTag:data)
  // IV is 16 bytes = 32 hex chars, authTag is 16 bytes = 32 hex chars
  const parts = value.split(":");
  return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32;
}

/**
 * Migration helper: encrypt all unencrypted values
 * Call this once to migrate existing plaintext values
 */
export function migrateValue(value: string): string {
  if (!value || isEncrypted(value)) {
    return value;
  }
  return encryptVaultValue(value);
}
