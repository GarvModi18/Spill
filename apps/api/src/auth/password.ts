import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await deriveKey(password, salt);
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, storedKey] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !storedKey || !/^[a-f0-9]{128}$/i.test(storedKey)) {
    return false;
  }
  const actualKey = await deriveKey(password, salt);
  const expectedKey = Buffer.from(storedKey, "hex");
  return actualKey.length === expectedKey.length && timingSafeEqual(actualKey, expectedKey);
}
