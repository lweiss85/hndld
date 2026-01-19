/**
 * Vault Encryption Service
 * 
 * Provides encryption at rest for sensitive vault items (access codes, WiFi passwords, etc.)
 * Uses AES-256-GCM with scrypt key derivation.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

function getEncryptionKey(): string {
  const key = process.env.VAULT_ENCRYPTION_KEY;
  if (!key) {
    console.warn("VAULT_ENCRYPTION_KEY not set - vault items will not be encrypted at rest!");
    return "";
  }
  return key;
}

function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return crypto.scryptSync(masterKey, salt, KEY_LENGTH);
}

/**
 * Encrypts a value for storage
 * Returns format: salt:iv:authTag:ciphertext (all hex encoded)
 */
export function encryptVaultValue(plaintext: string): string {
  const masterKey = getEncryptionKey();
  
  if (!masterKey) {
    return plaintext;
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(masterKey, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag();
  
  return [
    salt.toString("hex"),
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted
  ].join(":");
}

/**
 * Decrypts a value from storage
 * Expects format: salt:iv:authTag:ciphertext (all hex encoded)
 */
export function decryptVaultValue(encryptedValue: string): string {
  const masterKey = getEncryptionKey();
  
  if (!masterKey) {
    return encryptedValue;
  }

  const parts = encryptedValue.split(":");
  if (parts.length !== 4) {
    return encryptedValue;
  }

  const [saltHex, ivHex, authTagHex, ciphertext] = parts;
  
  try {
    const salt = Buffer.from(saltHex, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const key = deriveKey(masterKey, salt);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (error) {
    console.error("Failed to decrypt vault value:", error);
    return encryptedValue;
  }
}

/**
 * Checks if a value appears to be encrypted
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  if (parts.length !== 4) return false;
  
  const [salt, iv, authTag] = parts;
  return (
    salt.length === SALT_LENGTH * 2 &&
    iv.length === IV_LENGTH * 2 &&
    authTag.length === AUTH_TAG_LENGTH * 2 &&
    /^[0-9a-f]+$/i.test(salt) &&
    /^[0-9a-f]+$/i.test(iv) &&
    /^[0-9a-f]+$/i.test(authTag)
  );
}

/**
 * Migrates an unencrypted value to encrypted format
 */
export function migrateToEncrypted(value: string): string {
  if (isEncrypted(value)) {
    return value;
  }
  return encryptVaultValue(value);
}
