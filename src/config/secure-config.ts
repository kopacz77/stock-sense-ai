import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import { z } from "zod";

// Try to import keytar, fall back to file-based storage if not available
let keytar: typeof import("keytar") | null = null;
try {
  keytar = require("keytar");
} catch (error) {
  console.warn("Keytar not available, using file-based key storage (less secure)");
}

// Security constants for PBKDF2 key derivation
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEY_LENGTH = 32;
const PBKDF2_DIGEST = "sha256";
const SALT_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

const ConfigSchema = z.object({
  apis: z.object({
    alphaVantage: z.string().min(1, "Alpha Vantage API key is required"),
    finnhub: z.string().min(1, "Finnhub API key is required"),
    newsApi: z.string().optional(),
  }),
  notifications: z.object({
    email: z
      .object({
        sendgridKey: z.string(),
        recipient: z.string().email(),
      })
      .optional(),
    telegram: z
      .object({
        botToken: z.string(),
        chatId: z.string(),
      })
      .optional(),
    sms: z
      .object({
        twilioSid: z.string(),
        twilioAuth: z.string(),
        twilioFrom: z.string(),
        recipient: z.string(),
      })
      .optional(),
  }),
  trading: z.object({
    maxPositionSize: z.number().min(0).max(1).default(0.25), // Max 25% of portfolio
    maxRiskPerTrade: z.number().min(0).max(0.02).default(0.01), // Max 1% risk
    enableLiveTrading: z.boolean().default(false),
  }),
});

export type ConfigType = z.infer<typeof ConfigSchema>;

export class SecureConfig {
  private static instance: SecureConfig;
  private config: ConfigType | null = null;
  private readonly APP_NAME = "StockSenseAI";
  private readonly KEY_NAME = "EncryptionKey";
  private readonly CONFIG_FILE = "config.encrypted";

  private constructor() {}

  static getInstance(): SecureConfig {
    if (!SecureConfig.instance) {
      SecureConfig.instance = new SecureConfig();
    }
    return SecureConfig.instance;
  }

  async initialize(): Promise<void> {
    // Generate or retrieve encryption key
    let key = await this.getEncryptionKey();

    if (!key) {
      key = crypto.randomBytes(32).toString("hex");
      await this.saveEncryptionKey(key);
    }

    await this.loadConfig();
  }

  private async getEncryptionKey(): Promise<string | null> {
    if (keytar) {
      try {
        return await keytar.getPassword(this.APP_NAME, this.KEY_NAME);
      } catch (error) {
        console.warn("Failed to access keychain, falling back to file storage");
      }
    }

    // Fallback to file-based storage with PBKDF2 + AES-GCM encryption
    try {
      const keyFile = ".key";
      const encryptedKey = await fs.readFile(keyFile, "utf8");
      return this.decryptKeyFromStorage(encryptedKey);
    } catch {
      return null;
    }
  }

  private async saveEncryptionKey(key: string): Promise<void> {
    if (keytar) {
      try {
        await keytar.setPassword(this.APP_NAME, this.KEY_NAME, key);
        return;
      } catch (error) {
        console.warn("Failed to save to keychain, falling back to file storage");
      }
    }

    // Fallback to file-based storage with PBKDF2 + AES-GCM encryption
    const keyFile = ".key";
    const encryptedKey = this.encryptKeyForStorage(key);
    await fs.writeFile(keyFile, encryptedKey, { mode: 0o600 });
  }

  /**
   * Derive encryption key from master key using PBKDF2
   * This provides proper key derivation instead of simple XOR obfuscation
   */
  private deriveKey(masterKey: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      masterKey,
      salt,
      PBKDF2_ITERATIONS,
      PBKDF2_KEY_LENGTH,
      PBKDF2_DIGEST
    );
  }

  /**
   * Encrypt key for file storage using PBKDF2 + AES-256-GCM
   * Format: salt:iv:authTag:ciphertext (all hex encoded)
   */
  private encryptKeyForStorage(key: string): string {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const derivedKey = this.deriveKey(this.APP_NAME, salt);
    const iv = crypto.randomBytes(12); // GCM recommended IV size

    const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey, iv);
    let encrypted = cipher.update(key, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();

    return `${salt.toString("hex")}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  /**
   * Decrypt key from file storage using PBKDF2 + AES-256-GCM
   */
  private decryptKeyFromStorage(encryptedData: string): string {
    const parts = encryptedData.split(":");
    if (parts.length !== 4) {
      throw new Error("Invalid encrypted key format");
    }

    const [saltHex, ivHex, authTagHex, ciphertext] = parts as [string, string, string, string];
    const salt = Buffer.from(saltHex, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const derivedKey = this.deriveKey(this.APP_NAME, salt);

    const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  private async loadConfig(): Promise<void> {
    // First, try to load from encrypted config file
    try {
      const encryptedData = await fs.readFile(this.CONFIG_FILE, "utf8");
      const key = await this.getEncryptionKey();

      if (!key) throw new Error("Encryption key not found");

      const decrypted = this.decrypt(encryptedData, key);
      this.config = ConfigSchema.parse(JSON.parse(decrypted));
      return;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        console.error("Error loading config:", error);
      }
    }

    // Fallback: try to load from environment variables
    if (this.loadFromEnv()) {
      console.log("✅ Configuration loaded from environment variables");
      return;
    }

    console.log("No existing config found. Please run setup.");
  }

  private loadFromEnv(): boolean {
    const alphaVantage = process.env.ALPHA_VANTAGE_API_KEY;
    const finnhub = process.env.FINNHUB_API_KEY;

    // Require at least the API keys
    if (!alphaVantage || !finnhub || alphaVantage === "your_key_here" || finnhub === "your_key_here") {
      return false;
    }

    const config: ConfigType = {
      apis: {
        alphaVantage,
        finnhub,
        newsApi: process.env.NEWS_API_KEY,
      },
      notifications: {},
      trading: {
        maxPositionSize: Number(process.env.RISK_MAX_POSITION_SIZE_PERCENT || 25) / 100,
        maxRiskPerTrade: 0.01, // 1% max risk per trade (schema max is 2%)
        enableLiveTrading: false,
      },
    };

    // Add Telegram if configured
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;
    if (telegramToken && telegramChatId && telegramToken !== "your_token_here") {
      config.notifications.telegram = {
        botToken: telegramToken,
        chatId: telegramChatId,
      };
    }

    // Add SendGrid if configured
    const sendgridKey = process.env.SENDGRID_API_KEY;
    const sendgridTo = process.env.SENDGRID_TO_EMAIL;
    if (sendgridKey && sendgridTo && sendgridKey !== "your_key_here") {
      config.notifications.email = {
        sendgridKey,
        recipient: sendgridTo,
      };
    }

    try {
      this.config = ConfigSchema.parse(config);
      return true;
    } catch (error) {
      console.error("Invalid environment configuration:", error);
      return false;
    }
  }

  async saveConfig(config: ConfigType): Promise<void> {
    const validated = ConfigSchema.parse(config);
    const key = await this.getEncryptionKey();

    if (!key) throw new Error("Encryption key not found");

    const encrypted = this.encrypt(JSON.stringify(validated), key);
    await fs.writeFile(this.CONFIG_FILE, encrypted, "utf8");

    this.config = validated;
    console.log("✅ Configuration saved securely");
  }

  /**
   * Encrypt config data using AES-256-GCM (authenticated encryption)
   * Format: iv:authTag:ciphertext (all hex encoded)
   */
  private encrypt(text: string, key: string): string {
    const iv = crypto.randomBytes(12); // GCM recommended IV size is 12 bytes
    const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();

    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  /**
   * Decrypt config data using AES-256-GCM (authenticated encryption)
   * Verifies authenticity via auth tag to prevent tampering
   */
  private decrypt(encryptedText: string, key: string): string {
    const parts = encryptedText.split(":");

    // Support legacy CBC format (2 parts) for backward compatibility
    if (parts.length === 2) {
      return this.decryptLegacyCBC(encryptedText, key);
    }

    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }

    const [ivHex, authTagHex, encrypted] = parts as [string, string, string];
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Decrypt legacy AES-CBC encrypted data for backward compatibility
   * @deprecated Will be removed in future version
   */
  private decryptLegacyCBC(encryptedText: string, key: string): string {
    const [ivHex, encrypted] = encryptedText.split(":");
    if (!ivHex || !encrypted) {
      throw new Error("Invalid encrypted data format");
    }

    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key, "hex"), iv);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  get<T = any>(path: string): T {
    if (!this.config) throw new Error("Config not initialized");

    return path.split(".").reduce((obj, key) => obj?.[key], this.config as any) as T;
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  async clearConfig(): Promise<void> {
    try {
      await fs.unlink(this.CONFIG_FILE);
      
      // Clear keychain if available
      if (keytar) {
        try {
          await keytar.deletePassword(this.APP_NAME, this.KEY_NAME);
        } catch (error) {
          // Ignore keychain errors
        }
      }
      
      // Clear file-based key
      try {
        await fs.unlink(".key");
      } catch (error) {
        // Ignore file errors
      }
      
      this.config = null;
      console.log("🗑️ Configuration cleared");
    } catch (error) {
      console.error("Error clearing config:", error);
    }
  }

  getConfig(): ConfigType | null {
    return this.config;
  }
}
