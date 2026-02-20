import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

export function encryptField(plaintext: string, masterKey: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = scryptSync(masterKey, salt, KEY_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${salt.toString("hex")}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptField(encrypted: string, masterKey: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted field format");
  }

  const [saltHex, ivHex, tagHex, ciphertext] = parts;
  const key = scryptSync(masterKey, Buffer.from(saltHex, "hex"), KEY_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function isFieldEncrypted(value: string): boolean {
  const parts = value.split(":");
  if (parts.length !== 4) return false;

  const [salt, iv, tag] = parts;
  return (
    salt.length === SALT_LENGTH * 2 &&
    iv.length === IV_LENGTH * 2 &&
    tag.length === 32 &&
    /^[0-9a-f]+$/i.test(salt) &&
    /^[0-9a-f]+$/i.test(iv) &&
    /^[0-9a-f]+$/i.test(tag)
  );
}

export function rotateFieldEncryption(
  encrypted: string,
  oldMasterKey: string,
  newMasterKey: string
): string {
  const plaintext = decryptField(encrypted, oldMasterKey);
  return encryptField(plaintext, newMasterKey);
}
