// ***************************************************************************************
// * YAML 条件评估器 v3.0
// * 支持完整运算符、类型推断、嵌套路径和括号分组逻辑解析
// ***************************************************************************************

import type { YamlCondition, YamlOperator, YamlValue, Condition, ConditionType } from './types';

// ============================================================================
// 评估上下文
// ============================================================================

export interface EvaluationContext {
  frontmatter: Record<string, unknown>;
  fileName: string;
  filePath: string;
  content: string;
  tags: string[];
  ctime: Date;
  mtime: Date;
}

// ============================================================================
// 条件组（支持 AND/OR）
// ============================================================================

export interface ConditionGroup {
  logicOperator: 'AND' | 'OR';
  conditions: (YamlCondition | ConditionGroup | string)[];
}

// ============================================================================
// 内部评估结果（不带 condition 字段）
// ============================================================================

interface InternalResult {
  matched: boolean;
  reason?: string;
}

// ============================================================================
// 类型推断结果
// ============================================================================

type InferredType = 'string' | 'number' | 'boolean' | 'array' | 'datetime' | 'null';

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 获取嵌套路径的值
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * 类型推断
 */
function inferType(value: unknown, autoInferType?: boolean): { value: unknown; type: InferredType } {
  if (value === null || value === undefined) {
    return { value, type: 'null' };
  }

  if (!autoInferType) {
    return { value: String(value), type: 'string' };
  }

  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(value)) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return { value: date, type: 'datetime' };
      }
    }
    if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
      return { value: value.toLowerCase() === 'true', type: 'boolean' };
    }
    const num = Number(value);
    if (!isNaN(num) && value.trim() !== '') {
      return { value: num, type: 'number' };
    }
    return { value, type: 'string' };
  }

  if (typeof value === 'number') {
    return { value, type: 'number' };
  }
  if (typeof value === 'boolean') {
    return { value, type: 'boolean' };
  }
  if (Array.isArray(value)) {
    return { value, type: 'array' };
  }

  return { value: String(value), type: 'string' };
}

/**
 * 转换为数组
 */
function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

/**
 * 标准化日期
 */
function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/**
 * 比较两个值
 */
function compareValues(a: unknown, b: unknown): number {
  const aDate = normalizeDate(a);
  const bDate = normalizeDate(b);

  if (aDate && bDate) {
    return aDate.getTime() - bDate.getTime();
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b));
}

/**
 * 创建 Condition 对象
 */
function toCondition(yaml?: YamlCondition, type: ConditionType = 'yaml'): Condition {
  return {
    type,
    yaml,
  };
}

// ============================================================================
// YAML 条件评估器
// ============================================================================

export class YamlConditionEvaluator {
  private defaultContext: EvaluationContext;

  constructor(defaultContext?: Partial<EvaluationContext>) {
    this.defaultContext = {
      frontmatter: {},
      fileName: '',
      filePath: '',
      content: '',
      tags: [],
      ctime: new Date(),
      mtime: new Date(),
      ...defaultContext,
    };
  }

  /**
   * 评估单个条件
   */
  evaluate(yamlCond: YamlCondition, context?: Partial<EvaluationContext>): { matched: boolean; condition: Condition; reason?: string } {
    const ctx = { ...this.defaultContext, ...context };
    const condition = toCondition(yamlCond);

    try {
      let targetValue: unknown;

      if (yamlCond.nestedPath) {
        targetValue = getNestedValue(ctx.frontmatter as Record<string, unknown>, yamlCond.nestedPath);
      } else if (yamlCond.key) {
        targetValue = (ctx.frontmatter as Record<string, unknown>)[yamlCond.key];
      } else {
        switch (yamlCond.key) {
          case 'fileName': targetValue = ctx.fileName; break;
          case 'filePath': targetValue = ctx.filePath; break;
          case 'content': targetValue = ctx.content; break;
          case 'tags': targetValue = ctx.tags; break;
          case 'ctime': targetValue = ctx.ctime; break;
          case 'mtime': targetValue = ctx.mtime; break;
          default: targetValue = undefined;
        }
      }

      const inferred = inferType(targetValue, yamlCond.autoInferType);

      const matched = this.evaluateOperator(
        yamlCond.operator,
        targetValue,
        yamlCond.value,
        inferred.type,
        yamlCond
      );

      return {
        matched,
        condition,
        reason: matched
          ? `匹配: ${yamlCond.key || yamlCond.nestedPath} ${yamlCond.operator} ${yamlCond.value}`
          : `不匹配: ${yamlCond.key || yamlCond.nestedPath} ${yamlCond.operator} ${yamlCond.value}`,
      };
    } catch (error) {
      return {
        matched: false,
        condition,
        reason: `错误: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 评估条件组
   */
  evaluateGroup(group: ConditionGroup, context?: Partial<EvaluationContext>): { matched: boolean; condition: Condition; reason?: string } {
    const ctx = { ...this.defaultContext, ...context };
    const condition = toCondition();

    if (group.conditions.length === 0) {
      return { matched: true, condition, reason: '空条件组' };
    }

    const results: { matched: boolean; reason?: string }[] = [];

    for (const item of group.conditions) {
      let result: InternalResult;

      if (typeof item === 'string') {
        result = this.evaluateExpression(item, ctx);
      } else if ('logicOperator' in item) {
        result = this.evaluateGroup(item as ConditionGroup, ctx);
      } else {
        result = this.evaluate(item as YamlCondition, ctx);
      }

      results.push(result);

      if (group.logicOperator === 'AND' && !result.matched) {
        return { matched: false, condition, reason: `AND 短路: ${result.reason}` };
      }
      if (group.logicOperator === 'OR' && result.matched) {
        return { matched: true, condition, reason: `OR 满足: ${result.reason}` };
      }
    }

    const allMatched = results.every(r => r.matched);
    const anyMatched = results.some(r => r.matched);

    return {
      matched: group.logicOperator === 'AND' ? allMatched : anyMatched,
      condition,
      reason: group.logicOperator === 'AND'
        ? `AND 全部满足 (${results.filter(r => r.matched).length}/${results.length})`
        : `OR 满足 (${results.filter(r => r.matched).length}/${results.length})`,
    };
  }

  /**
   * 评估表达式字符串
   */
  evaluateExpression(expression: string, context?: Partial<EvaluationContext>): { matched: boolean; condition: Condition; reason?: string } {
    const ctx = { ...this.defaultContext, ...context };
    const condition = toCondition();
    const expr = expression.trim();

    try {
      if (!expr.includes('(') && !expr.includes(')')) {
        return this.parseSimpleExpression(expr, ctx, condition);
      }
      return this.parseBracketedExpression(expr, ctx, condition);
    } catch (error) {
      return {
        matched: false,
        condition,
        reason: `解析错误: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private evaluateOperator(
    operator: YamlOperator,
    targetValue: unknown,
    conditionValue: unknown,
    targetType: InferredType,
    condition: YamlCondition
  ): boolean {
    switch (operator) {
      case 'exists':
        return targetValue !== undefined && targetValue !== null;
      case 'notExists':
        return targetValue === undefined || targetValue === null;
      case 'equals':
        return this.evaluateEquals(targetValue, conditionValue, targetType);
      case 'notEquals':
        return !this.evaluateEquals(targetValue, conditionValue, targetType);
      case 'contains':
        return this.evaluateContains(targetValue, conditionValue);
      case 'startsWith':
        return String(targetValue).toLowerCase().startsWith(String(conditionValue).toLowerCase());
      case 'endsWith':
        return String(targetValue).toLowerCase().endsWith(String(conditionValue).toLowerCase());
      case 'matches':
        return this.evaluateRegex(targetValue, conditionValue);
      case 'arrayContains':
        return this.evaluateArrayContains(targetValue, conditionValue);
      case 'arrayNotContains':
        return !this.evaluateArrayContains(targetValue, conditionValue);
      case 'arrayHasAny':
        return this.evaluateArrayHasAny(targetValue, conditionValue);
      case 'arrayHasAll':
        return this.evaluateArrayHasAll(targetValue, conditionValue);
      case 'gt':
        return compareValues(targetValue, conditionValue) > 0;
      case 'gte':
        return compareValues(targetValue, conditionValue) >= 0;
      case 'lt':
        return compareValues(targetValue, conditionValue) < 0;
      case 'lte':
        return compareValues(targetValue, conditionValue) <= 0;
      case 'between':
        return this.evaluateBetween(targetValue, conditionValue);
      default:
        return false;
    }
  }

  private evaluateEquals(target: unknown, value: unknown, targetType: InferredType): boolean {
    const targetDate = normalizeDate(target);
    const valueDate = normalizeDate(value);

    if (targetDate && valueDate) {
      return targetDate.getTime() === valueDate.getTime();
    }
    if (targetType === 'boolean' || typeof target === 'boolean') {
      return Boolean(target) === Boolean(value);
    }
    if (typeof target === 'number' || typeof value === 'number') {
      return Number(target) === Number(value);
    }
    return String(target).toLowerCase() === String(value).toLowerCase();
  }

  private evaluateContains(target: unknown, value: unknown): boolean {
    return String(target).toLowerCase().includes(String(value).toLowerCase());
  }

  private evaluateRegex(target: unknown, pattern: unknown): boolean {
    try {
      return new RegExp(String(pattern), 'i').test(String(target));
    } catch {
      return false;
    }
  }

  private evaluateArrayContains(target: unknown, value: unknown): boolean {
    const arr = toArray(target);
    const searchValue = String(value).toLowerCase();
    return arr.some(item => String(item).toLowerCase() === searchValue);
  }

  private evaluateArrayHasAll(target: unknown, value: unknown): boolean {
    const arr = toArray(target);
    const searchValues = toArray(value).map(v => String(v).toLowerCase());
    return searchValues.every(searchVal =>
      arr.some(item => String(item).toLowerCase() === searchVal)
    );
  }

  private evaluateArrayHasAny(target: unknown, value: unknown): boolean {
    const arr = toArray(target);
    const searchValues = toArray(value).map(v => String(v).toLowerCase());
    return searchValues.some(searchVal =>
      arr.some(item => String(item).toLowerCase() === searchVal)
    );
  }

  private evaluateBetween(target: unknown, value: unknown): boolean {
    const range = toArray(value);
    if (range.length < 2) return false;
    const cmpMin = compareValues(target, range[0]);
    const cmpMax = compareValues(target, range[1]);
    return cmpMin >= 0 && cmpMax <= 0;
  }

  private parseSimpleExpression(expr: string, ctx: EvaluationContext, condition: Condition): { matched: boolean; condition: Condition; reason?: string } {
    const patterns = [
      /^(.+?)\s+(equals|notEquals|matches|gt|gte|lt|lte|between)\s+(.+)$/i,
      /^(.+?)\s+(contains|startsWith|endsWith)\s+(.+)$/i,
      /^(.+?)\s+(exists|notExists)$/i,
    ];

    for (const pattern of patterns) {
      const match = expr.match(pattern);
      if (match) {
        const [, key, operator, value] = match;
        const yamlCond: YamlCondition = {
          key: key.trim(),
          operator: operator.toLowerCase() as YamlOperator,
          value: this.parseValue(value.trim()),
          autoInferType: true,
        };
        return this.evaluate(yamlCond, ctx);
      }
    }

    return { matched: false, condition, reason: `无法解析: ${expr}` };
  }

  private parseBracketedExpression(expr: string, ctx: EvaluationContext, condition: Condition): { matched: boolean; condition: Condition; reason?: string } {
    let result = expr;

    while (result.includes('(')) {
      const start = result.lastIndexOf('(');
      const end = result.indexOf(')', start);

      if (end === -1) {
        return { matched: false, condition, reason: '括号不匹配' };
      }

      const inner = result.substring(start + 1, end);
      const innerResult = this.parseSimpleExpression(inner.trim(), ctx, condition);

      result = result.substring(0, start) + (innerResult.matched ? 'TRUE' : 'FALSE') + result.substring(end + 1);
    }

    return this.parseLogicExpression(result, ctx, condition);
  }

  private parseLogicExpression(expr: string, ctx: EvaluationContext, condition: Condition): { matched: boolean; condition: Condition; reason?: string } {
    return this.parseAndOrExpression(expr, ctx, condition);
  }

  private parseAndOrExpression(expr: string, ctx: EvaluationContext, condition: Condition): { matched: boolean; condition: Condition; reason?: string } {
    const orParts = expr.split(/\s+OR\s+/i);

    if (orParts.length > 1) {
      for (const part of orParts) {
        const result = this.parseAndOrExpression(part.trim(), ctx, condition);
        if (result.matched) {
          return { matched: true, condition, reason: `OR 满足: ${part.trim()}` };
        }
      }
      return { matched: false, condition, reason: 'OR 全部不满足' };
    }

    const andParts = expr.split(/\s+AND\s+/i);

    if (andParts.length > 1) {
      for (const part of andParts) {
        const result = this.parseAndOrExpression(part.trim(), ctx, condition);
        if (!result.matched) {
          return { matched: false, condition, reason: `AND 不满足: ${part.trim()}` };
        }
      }
      return { matched: true, condition, reason: 'AND 全部满足' };
    }

    const trimmed = expr.trim();
    if (trimmed === 'TRUE') {
      return { matched: true, condition };
    }
    if (trimmed === 'FALSE') {
      return { matched: false, condition };
    }

    return this.parseSimpleExpression(trimmed, ctx, condition);
  }

  private parseValue(value: string): YamlValue {
    const trimmed = value.trim();

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const inner = trimmed.slice(1, -1);
      return inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    }

    if (trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'false') return false;

    const num = Number(trimmed);
    if (!isNaN(num) && trimmed !== '') return num;

    const date = new Date(trimmed);
    if (!isNaN(date.getTime()) && /^\d/.test(trimmed)) return date;

    return trimmed.replace(/^["']|["']$/g, '');
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

export function evaluateYamlCondition(
  condition: YamlCondition,
  context: Partial<EvaluationContext>
): { matched: boolean; condition: Condition; reason?: string } {
  const evaluator = new YamlConditionEvaluator(context);
  return evaluator.evaluate(condition, context);
}

export function evaluateYamlExpression(
  expression: string,
  context: Partial<EvaluationContext>
): { matched: boolean; condition: Condition; reason?: string } {
  const evaluator = new YamlConditionEvaluator(context);
  return evaluator.evaluateExpression(expression, context);
}
