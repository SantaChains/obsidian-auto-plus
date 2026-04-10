// ***************************************************************************************
// * LoopExecutor 循环执行器 v1.0
// * 支持 forEach、while、doWhile 三种循环类型
// ***************************************************************************************

import { LoopConfig, LoopType } from './types';

// ============================================================================
// 类型定义
// ============================================================================

export interface LoopResult {
  iterations: number;
  outputs: unknown[];
  success: boolean;
  error?: string;
}

export interface LoopContext {
  index: number;
  item: unknown;
  items: unknown[];
  stop: boolean;
}

/**
 * 变量作用域 - 隔离循环变量
 */
export class VariableScope {
  private variables: Map<string, unknown> = new Map();

  set(key: string, value: unknown): void {
    this.variables.set(key, value);
  }

  get(key: string): unknown {
    return this.variables.get(key);
  }

  has(key: string): boolean {
    return this.variables.has(key);
  }

  clear(): void {
    this.variables.clear();
  }
}

// ============================================================================
// LoopExecutor 循环执行器
// ============================================================================

export class LoopExecutor {
  private stopped: boolean = false;
  private scope: VariableScope;
  private executor: (item: unknown, context: LoopContext) => Promise<unknown>;

  constructor(
    private config: LoopConfig,
    executor: (item: unknown, context: LoopContext) => Promise<unknown>
  ) {
    this.executor = executor;
    this.scope = new VariableScope();
  }

  /**
   * 停止循环
   */
  stop(): void {
    this.stopped = true;
  }

  /**
   * 重置停止标志
   */
  private resetStop(): void {
    this.stopped = false;
  }

  /**
   * 创建循环上下文
   */
  private createContext(index: number, item: unknown, items: unknown[]): LoopContext {
    return {
      index,
      item,
      items,
      stop: false,
    };
  }

  /**
   * 检查是否应该继续迭代
   */
  private shouldContinue(current: number, max: number): boolean {
    if (this.stopped) return false;
    if (max > 0 && current >= max) return false;
    return true;
  }

  /**
   * 执行 forEach 循环
   */
  private async executeForEach(items: unknown[]): Promise<LoopResult> {
    const maxIterations = this.config.maxIterations ?? items.length;
    const outputs: unknown[] = [];
    let iterations = 0;

    for (let i = 0; i < items.length; i++) {
      if (!this.shouldContinue(iterations, maxIterations)) break;

      const item = items[i];
      const context = this.createContext(i, item, items);

      // 设置循环变量到作用域
      if (this.config.variable) {
        this.scope.set(this.config.variable, item);
      }

      try {
        const result = await this.executor(item, context);
        outputs.push(result);
        iterations++;

        // 检查 context.stop
        if (context.stop) break;
      } catch (error) {
        if (!this.config.continueOnError) {
          return {
            iterations,
            outputs,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
        // 继续执行但记录错误
        outputs.push({ error: error instanceof Error ? error.message : String(error) });
        iterations++;
      }
    }

    return { iterations, outputs, success: true };
  }

  /**
   * 执行 while 循环
   */
  private async executeWhile(items: unknown[]): Promise<LoopResult> {
    const maxIterations = this.config.maxIterations ?? 1000;
    const outputs: unknown[] = [];
    let iterations = 0;

    while (this.shouldContinue(iterations, maxIterations)) {
      const item = iterations < items.length ? items[iterations] : undefined;
      const context = this.createContext(iterations, item, items);

      if (this.config.variable) {
        this.scope.set(this.config.variable, item);
      }

      // 评估条件
      const conditionMet = this.evaluateCondition(context);
      if (!conditionMet) break;

      try {
        const result = await this.executor(item, context);
        outputs.push(result);
        iterations++;

        if (context.stop) break;
      } catch (error) {
        if (!this.config.continueOnError) {
          return {
            iterations,
            outputs,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
        outputs.push({ error: error instanceof Error ? error.message : String(error) });
        iterations++;
      }
    }

    return { iterations, outputs, success: true };
  }

  /**
   * 执行 doWhile 循环
   */
  private async executeDoWhile(items: unknown[]): Promise<LoopResult> {
    const maxIterations = this.config.maxIterations ?? 1000;
    const outputs: unknown[] = [];
    let iterations = 0;
    let context: LoopContext;

    do {
      const item = iterations < items.length ? items[iterations] : undefined;
      context = this.createContext(iterations, item, items);

      if (this.config.variable) {
        this.scope.set(this.config.variable, item);
      }

      try {
        const result = await this.executor(item, context);
        outputs.push(result);
        iterations++;

        if (context.stop) break;
      } catch (error) {
        if (!this.config.continueOnError) {
          return {
            iterations,
            outputs,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
        outputs.push({ error: error instanceof Error ? error.message : String(error) });
        iterations++;
      }
    } while (this.shouldContinue(iterations, maxIterations) && this.evaluateCondition(context));

    return { iterations, outputs, success: true };
  }

  /**
   * 评估条件表达式
   * 简单实现：支持从作用域中读取变量进行比较
   */
  private evaluateCondition(context: LoopContext): boolean {
    if (!this.config.condition) return true;

    const condition = this.config.condition;

    // 支持 continueOnError 的短路求值
    if (condition === 'true' || condition === 'true') return true;
    if (condition === 'false' || condition === 'false') return false;

    // 支持 index 比较
    if (condition.includes('index')) {
      try {
        const index = context.index;
        const match = condition.match(/(\w+)\s*(<|>|<=|>=|==|!=)\s*(\d+)/);
        if (match) {
          const [, left, op, right] = match;
          const leftVal: number = left === 'index' ? index : Number(this.scope.get(left));
          const rightVal = parseInt(right, 10);
          switch (op) {
            case '<': return leftVal < rightVal;
            case '>': return leftVal > rightVal;
            case '<=': return leftVal <= rightVal;
            case '>=': return leftVal >= rightVal;
            case '==': return leftVal === rightVal;
            case '!=': return leftVal !== rightVal;
          }
        }
      } catch {
        return false;
      }
    }

    // 支持变量存在性检查
    if (this.config.variable) {
      const varValue = this.scope.get(this.config.variable);
      if (condition === `${this.config.variable}`) {
        return varValue !== undefined && varValue !== null;
      }
    }

    return true;
  }

  /**
   * 执行循环
   */
  async execute(items?: unknown[]): Promise<LoopResult> {
    this.resetStop();
    this.scope.clear();

    // 解析 items - 确保返回 unknown[]
    const rawItems = items ?? this.config.items;
    let loopItems: unknown[] = [];
    
    if (Array.isArray(rawItems)) {
      loopItems = rawItems;
    } else if (typeof rawItems === 'string') {
      loopItems = [rawItems];
    } else if (rawItems !== undefined) {
      loopItems = [rawItems];
    }

    const resolvedItems = loopItems;

    const type: LoopType = this.config.type;

    switch (type) {
      case 'forEach':
        return this.executeForEach(resolvedItems);
      case 'while':
        return this.executeWhile(resolvedItems);
      case 'doWhile':
        return this.executeDoWhile(resolvedItems);
      default:
        return {
          iterations: 0,
          outputs: [],
          success: false,
          error: `Unknown loop type: ${type}`,
        };
    }
  }
}
