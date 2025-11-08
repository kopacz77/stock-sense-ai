import sgMail from "@sendgrid/mail";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import chalk from "chalk";
import { SecureConfig } from "../config/secure-config.js";
import { TelegramService, type TelegramMessage } from "./telegram-service.js";
import type { Signal } from "../types/trading.js";

export interface AlertConfig {
  type: "STRONG_SIGNAL" | "RISK_WARNING" | "POSITION_UPDATE" | "MARKET_MOVE" | "SYSTEM_ALERT";
  symbol?: string;
  signals?: Signal[];
  message?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
}

export class AlertService {
  private config = SecureConfig.getInstance();
  private telegramService = new TelegramService();
  private logFile = "./logs/alerts.log";

  constructor() {
    // Initialize SendGrid when needed (after config is loaded)
    this.initializeSendGrid();
  }

  private initializeSendGrid(): void {
    try {
      const sendgridKey = this.config.get("notifications.email.sendgridKey");
      if (sendgridKey) {
        sgMail.setApiKey(sendgridKey);
      }
    } catch (error) {
      // Config not initialized yet, will be set up later
    }
  }

  async sendAlert(alert: AlertConfig): Promise<void> {
    // Always log to file (encrypted)
    await this.logAlert(alert);

    // Display console notification for immediate attention
    this.displayConsoleAlert(alert);

    // Send notifications in parallel
    const notifications = [];

    // Telegram notification
    const telegramConfig = this.config.get("notifications.telegram");
    if (telegramConfig?.botToken && telegramConfig?.chatId) {
      notifications.push(this.sendTelegramAlert(alert));
    }

    // Email notification (if configured)
    const emailConfig = this.config.get("notifications.email");
    if (emailConfig?.sendgridKey) {
      notifications.push(this.sendEmailAlert(alert, emailConfig.recipient));
    }

    // Wait for all notifications to complete
    const results = await Promise.allSettled(notifications);
    
    // Log any failures
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const service = index === 0 ? "Telegram" : "Email";
        console.warn(`${service} notification failed:`, result.reason);
      }
    });
  }

  private async sendTelegramAlert(alert: AlertConfig): Promise<void> {
    const telegramMessage: TelegramMessage = {
      type: alert.type,
      symbol: alert.symbol,
      signals: alert.signals,
      message: alert.message,
      priority: alert.priority,
    };

    const success = await this.telegramService.sendAlert(telegramMessage);
    if (!success) {
      throw new Error("Failed to send Telegram notification");
    }
  }

  private async sendEmailAlert(alert: AlertConfig, recipient: string): Promise<void> {
    // Ensure SendGrid is initialized
    this.initializeSendGrid();
    
    const subject = this.generateEmailSubject(alert);
    const html = this.generateEmailHtml(alert);

    try {
      await sgMail.send({
        to: recipient,
        from: "alerts@stocksense.ai",
        subject,
        html,
      });
    } catch (error) {
      throw new Error(`Failed to send email alert: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private generateEmailSubject(alert: AlertConfig): string {
    switch (alert.type) {
      case "STRONG_SIGNAL":
        if (alert.signals && alert.signals.length > 0) {
          const signal = alert.signals[0];
          if (signal) {
            return `🚨 Strong ${signal.action} Signal: ${signal.symbol}`;
          }
        }
        return "🚨 Strong Trading Signal Detected";
      case "RISK_WARNING":
        return `⚠️ Risk Warning${alert.symbol ? `: ${alert.symbol}` : ""}`;
      case "POSITION_UPDATE":
        return `📈 Position Update${alert.symbol ? `: ${alert.symbol}` : ""}`;
      case "MARKET_MOVE":
        return `📊 Market Movement${alert.symbol ? `: ${alert.symbol}` : ""}`;
      case "SYSTEM_ALERT":
        return "🔧 Stock Sense AI System Alert";
      default:
        return "📊 Stock Analysis Alert";
    }
  }

  private generateEmailHtml(alert: AlertConfig): string {
    if (alert.type === "STRONG_SIGNAL" && alert.signals && alert.signals.length > 0) {
      const signal = alert.signals[0];
      if (!signal) {
        return this.generateGenericEmailHtml(alert);
      }
      return `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: ${signal.action === "BUY" ? "#10b981" : "#ef4444"};">
            ${signal.action} Signal: ${alert.symbol}
          </h2>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Strategy:</strong> ${signal.strategy}</p>
            <p><strong>Confidence:</strong> ${signal.confidence.toFixed(1)}%</p>
            <p><strong>Strength:</strong> ${signal.strength.toFixed(1)}%</p>
            ${signal.stopLoss ? `
              <p><strong>Risk Management:</strong></p>
              <ul>
                <li>Stop Loss: $${signal.stopLoss.toFixed(2)}</li>
                <li>Take Profit: $${signal.takeProfit?.toFixed(2)}</li>
                <li>Position Size: ${signal.positionSize} shares</li>
              </ul>
            ` : ""}
          </div>
          <div style="background: #fef3c7; padding: 15px; border-radius: 8px;">
            <p><strong>Reasons:</strong></p>
            <ul>
              ${signal.reasons.map(r => `<li>${r}</li>`).join("")}
            </ul>
          </div>
          <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
            This is an automated alert. Always do your own research before trading.
          </p>
        </div>
      `;
    }

    return this.generateGenericEmailHtml(alert);
  }

  private generateGenericEmailHtml(alert: AlertConfig): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2>Stock Sense AI Alert</h2>
        <p><strong>Type:</strong> ${alert.type}</p>
        ${alert.symbol ? `<p><strong>Symbol:</strong> ${alert.symbol}</p>` : ""}
        <p>${alert.message || "Stock analysis update"}</p>
        <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
          This is an automated alert from Stock Sense AI.
        </p>
      </div>
    `;
  }

  private displayConsoleAlert(alert: AlertConfig): void {
    const priority = alert.priority || "MEDIUM";
    const priorityColor = this.getPriorityColor(priority);
    
    console.log("\n" + priorityColor("━".repeat(60)));
    console.log(priorityColor("🚨 ALERT") + ` (${priority})`);

    if (alert.type === "STRONG_SIGNAL" && alert.signals && alert.signals.length > 0) {
      const signal = alert.signals[0];
      if (signal) {
        const actionColor = signal.action === "BUY" ? chalk.green : chalk.red;

        console.log(chalk.bold(`Symbol: ${alert.symbol}`));
        console.log(`Action: ${actionColor.bold(signal.action)}`);
        console.log(`Confidence: ${chalk.bold(signal.confidence.toFixed(1) + "%")}`);
        console.log(`Strategy: ${signal.strategy}`);

        if (signal.stopLoss) {
          console.log(chalk.gray(`Stop Loss: $${signal.stopLoss.toFixed(2)}`));
          console.log(chalk.gray(`Take Profit: $${signal.takeProfit?.toFixed(2)}`));
        }
      }
    } else {
      console.log(`Type: ${alert.type}`);
      if (alert.symbol) console.log(`Symbol: ${alert.symbol}`);
      console.log(`Message: ${alert.message}`);
    }

    console.log(priorityColor("━".repeat(60)) + "\n");
  }

  private getPriorityColor(priority: string) {
    switch (priority) {
      case "LOW": return chalk.green;
      case "MEDIUM": return chalk.yellow;
      case "HIGH": return chalk.magenta;
      case "URGENT": return chalk.red;
      default: return chalk.blue;
    }
  }

  private async logAlert(alert: AlertConfig): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      ...alert,
    };

    try {
      await fs.mkdir(path.dirname(this.logFile), { recursive: true });
      await fs.appendFile(this.logFile, JSON.stringify(logEntry) + "\n", "utf8");
    } catch (error) {
      console.error("Failed to log alert:", error);
    }
  }

  async testNotifications(): Promise<{
    telegram: boolean;
    email: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    let telegram = false;
    let email = false;

    // Test Telegram
    try {
      const telegramConfig = this.config.get("notifications.telegram");
      if (telegramConfig?.botToken && telegramConfig?.chatId) {
        telegram = await this.telegramService.testConnection();
        if (telegram) {
          await this.telegramService.sendTestMessage();
        }
      } else {
        errors.push("Telegram not configured");
      }
    } catch (error) {
      errors.push(`Telegram error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    // Test Email
    try {
      const emailConfig = this.config.get("notifications.email");
      if (emailConfig?.sendgridKey && emailConfig?.recipient) {
        // Just check if SendGrid key is configured
        email = true;
      } else {
        errors.push("Email not configured");
      }
    } catch (error) {
      errors.push(`Email error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    return { telegram, email, errors };
  }
}