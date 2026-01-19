import crypto from "crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): string {
  const key = process.env.SESSION_SECRET;
  if (!key) {
    throw new Error("SESSION_SECRET environment variable is required for encryption");
  }
  return key;
}

function deriveKey(salt: Buffer): Buffer {
  return crypto.scryptSync(getEncryptionKey(), salt, 32);
}

export function encrypt(text: string): string {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(salt);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return salt.toString("hex") + ":" + iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted;
}

export function decrypt(encryptedData: string): string {
  const [saltHex, ivHex, authTagHex, encryptedHex] = encryptedData.split(":");
  if (!saltHex || !ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Invalid encrypted data format");
  }
  const salt = Buffer.from(saltHex, "hex");
  const key = deriveKey(salt);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function isEncryptedFormat(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 4 && parts[0].length === 32 && parts[1].length === 32;
}
