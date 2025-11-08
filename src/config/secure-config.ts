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
    
    // Fallback to file-based storage
    try {
      const keyFile = ".key";
      const encryptedKey = await fs.readFile(keyFile, "utf8");
      // Use a simple XOR obfuscation (not secure, but better than plaintext)
      return this.deobfuscateKey(encryptedKey);
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
    
    // Fallback to file-based storage with obfuscation
    const keyFile = ".key";
    const obfuscatedKey = this.obfuscateKey(key);
    await fs.writeFile(keyFile, obfuscatedKey, { mode: 0o600 });
  }

  private obfuscateKey(key: string): string {
    // Simple XOR obfuscation (not cryptographically secure)
    const obfuscator = "StockSenseAI2024";
    let result = "";
    for (let i = 0; i < key.length; i++) {
      result += String.fromCharCode(
        key.charCodeAt(i) ^ obfuscator.charCodeAt(i % obfuscator.length)
      );
    }
    return Buffer.from(result).toString("base64");
  }

  private deobfuscateKey(obfuscatedKey: string): string {
    // Reverse the XOR obfuscation
    const obfuscator = "StockSenseAI2024";
    const data = Buffer.from(obfuscatedKey, "base64").toString();
    let result = "";
    for (let i = 0; i < data.length; i++) {
      result += String.fromCharCode(
        data.charCodeAt(i) ^ obfuscator.charCodeAt(i % obfuscator.length)
      );
    }
    return result;
  }

  private async loadConfig(): Promise<void> {
    try {
      const encryptedData = await fs.readFile(this.CONFIG_FILE, "utf8");
      const key = await this.getEncryptionKey();

      if (!key) throw new Error("Encryption key not found");

      const decrypted = this.decrypt(encryptedData, key);
      this.config = ConfigSchema.parse(JSON.parse(decrypted));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        console.log("No existing config found. Please run setup.");
      } else {
        console.error("Error loading config:", error);
      }
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

  private encrypt(text: string, key: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key, "hex"), iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    return `${iv.toString("hex")}:${encrypted}`;
  }

  private decrypt(encryptedText: string, key: string): string {
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
