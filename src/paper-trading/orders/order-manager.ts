/**
 * Order Management System for Paper Trading
 * Handles all order types, lifecycle management, and validation
 */

import type {
  PaperOrder,
  OrderType,
  OrderSide,
  OrderStatus,
  TimeInForce,
  MarketDataUpdate,
} from "../types/paper-trading-types.js";
import type { Signal } from "../../types/trading.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Order Manager
 * Manages order lifecycle from creation to fill/cancel
 */
export class OrderManager {
  private orders: Map<string, PaperOrder> = new Map();
  private orderHistory: PaperOrder[] = [];

  constructor() {}

  /**
   * Create a new order
   */
  createOrder(params: {
    symbol: string;
    type: OrderType;
    side: OrderSide;
    quantity: number;
    limitPrice?: number;
    stopPrice?: number;
    trailingAmount?: number;
    trailingPercent?: number;
    signal?: Signal;
    strategyName?: string;
    stopLoss?: number;
    takeProfit?: number;
    timeInForce?: TimeInForce;
    expiresAt?: Date;
  }): PaperOrder {
    // Validate order parameters
    this.validateOrderParams(params);

    const order: PaperOrder = {
      id: uuidv4(),
      symbol: params.symbol,
      type: params.type,
      side: params.side,
      quantity: params.quantity,
      status: "PENDING",
      limitPrice: params.limitPrice,
      stopPrice: params.stopPrice,
      trailingAmount: params.trailingAmount,
      trailingPercent: params.trailingPercent,
      filledQuantity: 0,
      remainingQuantity: params.quantity,
      createdAt: new Date(),
      updatedAt: new Date(),
      signal: params.signal,
      strategyName: params.strategyName,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      timeInForce: params.timeInForce ?? "GTC",
      expiresAt: params.expiresAt,
      commissionPaid: 0,
      slippagePaid: 0,
    };

    this.orders.set(order.id, order);

    return order;
  }

  /**
   * Validate order parameters
   */
  private validateOrderParams(params: {
    symbol: string;
    type: OrderType;
    side: OrderSide;
    quantity: number;
    limitPrice?: number;
    stopPrice?: number;
    trailingAmount?: number;
    trailingPercent?: number;
  }): void {
    if (params.quantity <= 0) {
      throw new Error("Order quantity must be positive");
    }

    if (params.type === "LIMIT" && !params.limitPrice) {
      throw new Error("Limit price required for LIMIT orders");
    }

    if (params.type === "STOP_LOSS" && !params.stopPrice) {
      throw new Error("Stop price required for STOP_LOSS orders");
    }

    if (
      params.type === "TRAILING_STOP" &&
      !params.trailingAmount &&
      !params.trailingPercent
    ) {
      throw new Error(
        "Trailing amount or percent required for TRAILING_STOP orders"
      );
    }

    if (params.limitPrice && params.limitPrice <= 0) {
      throw new Error("Limit price must be positive");
    }

    if (params.stopPrice && params.stopPrice <= 0) {
      throw new Error("Stop price must be positive");
    }

    if (params.trailingAmount && params.trailingAmount <= 0) {
      throw new Error("Trailing amount must be positive");
    }

    if (
      params.trailingPercent &&
      (params.trailingPercent <= 0 || params.trailingPercent >= 100)
    ) {
      throw new Error("Trailing percent must be between 0 and 100");
    }
  }

  /**
   * Cancel an order
   */
  cancelOrder(orderId: string, reason?: string): PaperOrder {
    const order = this.orders.get(orderId);

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (order.status === "FILLED") {
      throw new Error(`Cannot cancel filled order ${orderId}`);
    }

    if (order.status === "CANCELLED") {
      throw new Error(`Order ${orderId} already cancelled`);
    }

    order.status = "CANCELLED";
    order.cancelledAt = new Date();
    order.updatedAt = new Date();
    if (reason) {
      order.notes = (order.notes ?? "") + ` Cancelled: ${reason}`;
    }

    this.orders.delete(orderId);
    this.orderHistory.push(order);

    return order;
  }

  /**
   * Fill an order (fully or partially)
   */
  fillOrder(
    orderId: string,
    fillPrice: number,
    fillQuantity: number,
    commission: number,
    slippage: number
  ): PaperOrder {
    const order = this.orders.get(orderId);

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (order.status === "FILLED" || order.status === "CANCELLED") {
      throw new Error(`Cannot fill order ${orderId} with status ${order.status}`);
    }

    if (fillQuantity > order.remainingQuantity) {
      throw new Error(
        `Fill quantity ${fillQuantity} exceeds remaining quantity ${order.remainingQuantity}`
      );
    }

    // Update order
    order.filledQuantity += fillQuantity;
    order.remainingQuantity -= fillQuantity;
    order.commissionPaid += commission;
    order.slippagePaid += slippage;
    order.updatedAt = new Date();

    // Calculate average fill price
    if (order.averageFillPrice === undefined) {
      order.averageFillPrice = fillPrice;
    } else {
      const totalFilled = order.filledQuantity;
      const previousValue = order.averageFillPrice * (totalFilled - fillQuantity);
      const newValue = fillPrice * fillQuantity;
      order.averageFillPrice = (previousValue + newValue) / totalFilled;
    }

    // Update status
    if (order.remainingQuantity === 0) {
      order.status = "FILLED";
      order.fillPrice = order.averageFillPrice;
      order.filledAt = new Date();

      // Move to history
      this.orders.delete(orderId);
      this.orderHistory.push(order);
    } else {
      order.status = "PARTIALLY_FILLED";
    }

    return order;
  }

  /**
   * Check if order should be executed based on market data
   */
  shouldExecuteOrder(order: PaperOrder, marketData: MarketDataUpdate): boolean {
    const price = marketData.price;

    switch (order.type) {
      case "MARKET":
        // Market orders execute immediately
        return true;

      case "LIMIT":
        if (!order.limitPrice) return false;
        // Buy limit: execute if market price <= limit price
        // Sell limit: execute if market price >= limit price
        if (order.side === "BUY") {
          return price <= order.limitPrice;
        } else {
          return price >= order.limitPrice;
        }

      case "STOP_LOSS":
        if (!order.stopPrice) return false;
        // Buy stop: execute if market price >= stop price
        // Sell stop: execute if market price <= stop price
        if (order.side === "BUY") {
          return price >= order.stopPrice;
        } else {
          return price <= order.stopPrice;
        }

      case "TAKE_PROFIT":
        // Same logic as limit orders for take profit
        if (!order.limitPrice) return false;
        if (order.side === "BUY") {
          return price <= order.limitPrice;
        } else {
          return price >= order.limitPrice;
        }

      case "TRAILING_STOP":
        // Trailing stops are managed separately
        // They need to track highest/lowest prices
        return this.checkTrailingStop(order, marketData);

      default:
        return false;
    }
  }

  /**
   * Check if trailing stop should trigger
   */
  private checkTrailingStop(
    order: PaperOrder,
    marketData: MarketDataUpdate
  ): boolean {
    // Trailing stops need state tracking - simplified for now
    // In production, this would track the highest/lowest price since order creation
    const price = marketData.price;

    if (order.trailingPercent) {
      // Percentage-based trailing stop
      const trailAmount = price * (order.trailingPercent / 100);
      const stopPrice =
        order.side === "SELL" ? price - trailAmount : price + trailAmount;

      // For sell: trigger if price drops by trailing%
      // For buy: trigger if price rises by trailing%
      if (order.side === "SELL") {
        return price <= stopPrice;
      } else {
        return price >= stopPrice;
      }
    } else if (order.trailingAmount) {
      // Fixed amount trailing stop
      const stopPrice =
        order.side === "SELL"
          ? price - order.trailingAmount
          : price + order.trailingAmount;

      if (order.side === "SELL") {
        return price <= stopPrice;
      } else {
        return price >= stopPrice;
      }
    }

    return false;
  }

  /**
   * Update trailing stop price
   */
  updateTrailingStop(
    orderId: string,
    highPrice: number,
    lowPrice: number
  ): void {
    const order = this.orders.get(orderId);

    if (!order || order.type !== "TRAILING_STOP") {
      return;
    }

    // Update stop price based on highest/lowest price
    if (order.trailingPercent) {
      if (order.side === "SELL") {
        // Sell trailing stop: follows price up
        const newStopPrice = highPrice * (1 - order.trailingPercent / 100);
        if (!order.stopPrice || newStopPrice > order.stopPrice) {
          order.stopPrice = newStopPrice;
        }
      } else {
        // Buy trailing stop: follows price down
        const newStopPrice = lowPrice * (1 + order.trailingPercent / 100);
        if (!order.stopPrice || newStopPrice < order.stopPrice) {
          order.stopPrice = newStopPrice;
        }
      }
    } else if (order.trailingAmount) {
      if (order.side === "SELL") {
        const newStopPrice = highPrice - order.trailingAmount;
        if (!order.stopPrice || newStopPrice > order.stopPrice) {
          order.stopPrice = newStopPrice;
        }
      } else {
        const newStopPrice = lowPrice + order.trailingAmount;
        if (!order.stopPrice || newStopPrice < order.stopPrice) {
          order.stopPrice = newStopPrice;
        }
      }
    }

    order.updatedAt = new Date();
  }

  /**
   * Expire orders based on time in force
   */
  expireOrders(currentTime: Date): PaperOrder[] {
    const expired: PaperOrder[] = [];

    for (const [orderId, order] of this.orders) {
      let shouldExpire = false;

      // Check explicit expiration time
      if (order.expiresAt && currentTime >= order.expiresAt) {
        shouldExpire = true;
      }

      // Check time in force
      if (order.timeInForce === "DAY") {
        // Expire at end of trading day (simplified: 24 hours)
        const hoursSinceCreation =
          (currentTime.getTime() - order.createdAt.getTime()) /
          (1000 * 60 * 60);
        if (hoursSinceCreation >= 24) {
          shouldExpire = true;
        }
      }

      if (shouldExpire) {
        order.status = "EXPIRED";
        order.updatedAt = currentTime;
        this.orders.delete(orderId);
        this.orderHistory.push(order);
        expired.push(order);
      }
    }

    return expired;
  }

  /**
   * Get order by ID
   */
  getOrder(orderId: string): PaperOrder | undefined {
    return this.orders.get(orderId);
  }

  /**
   * Get all active orders
   */
  getActiveOrders(): Map<string, PaperOrder> {
    return new Map(this.orders);
  }

  /**
   * Get active orders for symbol
   */
  getActiveOrdersForSymbol(symbol: string): PaperOrder[] {
    return Array.from(this.orders.values()).filter((o) => o.symbol === symbol);
  }

  /**
   * Get order history
   */
  getOrderHistory(): PaperOrder[] {
    return [...this.orderHistory];
  }

  /**
   * Get recent orders
   */
  getRecentOrders(count: number): PaperOrder[] {
    return this.orderHistory.slice(-count);
  }

  /**
   * Get order count
   */
  getOrderCount(): number {
    return this.orders.size;
  }

  /**
   * Get filled orders count
   */
  getFilledOrdersCount(): number {
    return this.orderHistory.filter((o) => o.status === "FILLED").length;
  }

  /**
   * Get cancelled orders count
   */
  getCancelledOrdersCount(): number {
    return this.orderHistory.filter((o) => o.status === "CANCELLED").length;
  }

  /**
   * Cancel all orders for symbol
   */
  cancelAllOrdersForSymbol(symbol: string): PaperOrder[] {
    const cancelled: PaperOrder[] = [];

    for (const [orderId, order] of this.orders) {
      if (order.symbol === symbol) {
        const cancelledOrder = this.cancelOrder(orderId, "Symbol cleanup");
        cancelled.push(cancelledOrder);
      }
    }

    return cancelled;
  }

  /**
   * Cancel all orders
   */
  cancelAllOrders(): PaperOrder[] {
    const cancelled: PaperOrder[] = [];

    for (const orderId of this.orders.keys()) {
      const cancelledOrder = this.cancelOrder(orderId, "Cancel all");
      cancelled.push(cancelledOrder);
    }

    return cancelled;
  }

  /**
   * Load orders from saved data
   */
  loadOrders(orders: Map<string, PaperOrder>, history: PaperOrder[]): void {
    this.orders = new Map(orders);
    this.orderHistory = [...history];
  }

  /**
   * Reset order manager
   */
  reset(): void {
    this.orders.clear();
    this.orderHistory = [];
  }
}
