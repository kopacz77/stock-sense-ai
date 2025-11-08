import axios from "axios";
import { SecureConfig } from "../config/secure-config.js";
import type { Signal } from "../types/trading.js";

export interface TelegramMessage {
  type: "STRONG_SIGNAL" | "RISK_WARNING" | "POSITION_UPDATE" | "MARKET_MOVE" | "SYSTEM_ALERT";
  symbol?: string;
  signals?: Signal[];
  message?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
}

export class TelegramService {
  private config = SecureConfig.getInstance();
  private baseUrl = "https://api.telegram.org";

  async sendAlert(alert: TelegramMessage): Promise<boolean> {
    const telegramConfig = this.config.get("notifications.telegram");
    
    if (!telegramConfig?.botToken || !telegramConfig?.chatId) {
      console.warn("Telegram not configured, skipping notification");
      return false;
    }

    try {
      const message = this.formatMessage(alert);
      const url = `${this.baseUrl}/bot${telegramConfig.botToken}/sendMessage`;
      
      await axios.post(url, {
        chat_id: telegramConfig.chatId,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });

      return true;
    } catch (error) {
      console.error("Failed to send Telegram notification:", error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  }

  private formatMessage(alert: TelegramMessage): string {
    const timestamp = new Date().toLocaleString();
    const priority = alert.priority || "MEDIUM";
    const priorityEmoji = this.getPriorityEmoji(priority);
    
    let message = `${priorityEmoji} *Stock Sense AI Alert*\n`;
    message += `📅 ${timestamp}\n\n`;

    switch (alert.type) {
      case "STRONG_SIGNAL":
        if (alert.signals && alert.signals.length > 0) {
          const signal = alert.signals[0];
          if (signal) {
            const actionEmoji = signal.action === "BUY" ? "🟢" : signal.action === "SELL" ? "🔴" : "⚪";
            
            message += `${actionEmoji} *Strong ${signal.action} Signal*\n`;
            message += `📊 Symbol: *${signal.symbol}*\n`;
            message += `🎯 Strategy: ${signal.strategy}\n`;
            message += `💪 Confidence: *${signal.confidence.toFixed(1)}%*\n`;
            message += `⚡ Strength: ${signal.strength.toFixed(1)}%\n\n`;
            
            if (signal.stopLoss && signal.takeProfit) {
              message += `📋 *Risk Management:*\n`;
              message += `🛑 Stop Loss: $${signal.stopLoss.toFixed(2)}\n`;
              message += `🎯 Take Profit: $${signal.takeProfit.toFixed(2)}\n`;
              message += `📈 Position Size: ${signal.positionSize} shares\n\n`;
            }
            
            message += `💡 *Key Reasons:*\n`;
            signal.reasons.slice(0, 3).forEach((reason, index) => {
              message += `${index + 1}. ${reason}\n`;
            });
            
            if (signal.reasons.length > 3) {
              message += `... and ${signal.reasons.length - 3} more\n`;
            }
          }
        }
        break;

      case "RISK_WARNING":
        message += `⚠️ *Risk Warning*\n`;
        if (alert.symbol) message += `📊 Symbol: ${alert.symbol}\n`;
        message += `📝 ${alert.message || "Risk threshold exceeded"}\n`;
        break;

      case "POSITION_UPDATE":
        message += `📈 *Position Update*\n`;
        if (alert.symbol) message += `📊 Symbol: ${alert.symbol}\n`;
        message += `📝 ${alert.message || "Position has been updated"}\n`;
        break;

      case "MARKET_MOVE":
        message += `📊 *Market Movement*\n`;
        if (alert.symbol) message += `📊 Symbol: ${alert.symbol}\n`;
        message += `📝 ${alert.message || "Significant market movement detected"}\n`;
        break;

      case "SYSTEM_ALERT":
        message += `🔧 *System Alert*\n`;
        message += `📝 ${alert.message || "System notification"}\n`;
        break;

      default:
        message += `📝 ${alert.message || "Stock analysis update"}\n`;
    }

    message += `\n⚠️ _This is an automated alert. Always do your own research before trading._`;
    
    return message;
  }

  private getPriorityEmoji(priority: string): string {
    switch (priority) {
      case "LOW": return "🟢";
      case "MEDIUM": return "🟡";
      case "HIGH": return "🟠";
      case "URGENT": return "🔴";
      default: return "🔵";
    }
  }

  async testConnection(): Promise<boolean> {
    const telegramConfig = this.config.get("notifications.telegram");
    
    if (!telegramConfig?.botToken || !telegramConfig?.chatId) {
      return false;
    }

    try {
      const url = `${this.baseUrl}/bot${telegramConfig.botToken}/getMe`;
      const response = await axios.get(url);
      return response.data.ok === true;
    } catch (error) {
      return false;
    }
  }

  async sendTestMessage(): Promise<boolean> {
    return this.sendAlert({
      type: "SYSTEM_ALERT",
      message: "🎉 Telegram notifications are working correctly!",
      priority: "LOW",
    });
  }
}