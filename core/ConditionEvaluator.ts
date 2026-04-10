// ***************************************************************************************
// * 条件评估器 v3.0
// * 负责评估单个条件是否匹配
// * 支持：类型推断、Key模式匹配、数组操作、数值比较
// * 集成 YamlConditionEvaluator 支持完整表达式和分组逻辑
// ***************************************************************************************

import { CachedMetadata, TFile } from 'obsidian';
import {
  Condition,
  ConditionType,
  EvaluationResult,
  YamlOperator,
  YamlValueType,
  KeyMatchMode,
  YamlArrayMatchMode,
  YamlCondition,
  YamlKeyCondition,
  YamlValue,
  YamlValueOptions,
} from './types';
import { YamlConditionEvaluator, EvaluationContext } from './YamlConditionEvaluator';

export interface EvaluatorOptions {
  useRegexForTags: boolean;
}

type TimeUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

export class ConditionEvaluator {
  private options: EvaluatorOptions;
  private yamlEvaluator: YamlConditionEvaluator;

  constructor(options: EvaluatorOptions = { useRegexForTags: false }) {
    this.options = options;
    this.yamlEvaluator = new YamlConditionEvaluator();
  }

  setOptions(options: Partial<EvaluatorOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * 构建评估上下文
   */
  private buildEvaluationContext(
    fileName: string,
    cacheTag: string[] | null,
    fileCache: CachedMetadata | null,
    file?: TFile,
    content?: string
  ): EvaluationContext {
    return {
      fileName,
      filePath: file?.path || '',
      frontmatter: fileCache?.frontmatter || {},
      content: content || '',
      tags: cacheTag || [],
      ctime: file ? new Date(file.stat.ctime) : new Date(),
      mtime: file ? new Date(file.stat.mtime) : new Date(),
    };
  }

  evaluate(
    condition: Condition,
    fileName: string,
    cacheTag: string[] | null,
    fileCache: CachedMetadata | null,
    file?: TFile,
    content?: string
  ): EvaluationResult {
    const matched = this.evaluateCondition(condition, fileName, cacheTag, fileCache, file, content);
    return {
      matched,
      condition,
      reason: matched ? undefined : this.getFailureReason(condition),
    };
  }

  private evaluateCondition(
    condition: Condition,
    fileName: string,
    cacheTag: string[] | null,
    fileCache: CachedMetadata | null,
    file?: TFile,
    content?: string
  ): boolean {
    switch (condition.type) {
      case 'tag':
        return this.evaluateTagCondition(condition, cacheTag);
      case 'title':
        return this.evaluateTitleCondition(condition, fileName);
      case 'yaml':
        return this.evaluateYamlConditionWithEvaluator(condition, fileCache, fileName, cacheTag, file, content);
      case 'mtime':
        return this.evaluateMtimeCondition(condition, file);
      case 'path':
        return this.evaluatePathCondition(condition, file);
      case 'content':
        return this.evaluateContentCondition(condition, content);
      default:
        return false;
    }
  }

  /**
   * 使用 YamlConditionEvaluator 评估 YAML 条件
   */
  private evaluateYamlConditionWithEvaluator(
    condition: Condition,
    fileCache: CachedMetadata | null,
    fileName: string,
    cacheTag: string[] | null,
    file?: TFile,
    content?: string
  ): boolean {
    if (!condition.yaml) {
      return false;
    }

    const context = this.buildEvaluationContext(fileName, cacheTag, fileCache, file, content);
    const result = this.yamlEvaluator.evaluate(condition.yaml, context);
    return result.matched;
  }

  private evaluateContentCondition(condition: Condition, content?: string): boolean {
    if (!condition.contentPattern || content === undefined) {
      return false;
    }

    try {
      const regex = new RegExp(condition.contentPattern);
      return regex.test(content);
    } catch {
      return false;
    }
  }

  private evaluateTagCondition(condition: Condition, cacheTag: string[] | null): boolean {
    if (!condition.tag || !cacheTag) {
      return false;
    }

    if (this.options.useRegexForTags) {
      try {
        const regex = new RegExp(condition.tag);
        return cacheTag.some(tag => regex.test(tag));
      } catch {
        return false;
      }
    } else {
      return cacheTag.some(tag => tag === condition.tag);
    }
  }

  private evaluateTitleCondition(condition: Condition, fileName: string): boolean {
    if (!condition.pattern) {
      return false;
    }

    try {
      const regex = new RegExp(condition.pattern);
      return regex.test(fileName);
    } catch {
      return false;
    }
  }

  private evaluateYamlCondition(condition: Condition, fileCache: CachedMetadata | null): boolean {
    if (!condition.yaml) {
      return false;
    }

    const frontmatter = fileCache?.frontmatter;
    return this.evaluateYamlConditionCore(frontmatter ?? null, condition.yaml);
  }

  private evaluateYamlConditionCore(
    frontmatter: Record<string, unknown> | null,
    cond: YamlCondition
  ): boolean {
    if (!frontmatter) {
      return cond.operator === 'notExists';
    }

    // 支持嵌套路径，如 "metadata.author.name"
    let targetFrontmatter = frontmatter;
    let targetCond = cond;

    if (cond.nestedPath) {
      const nestedValue = this.getNestedValue(frontmatter, cond.nestedPath);
      if (nestedValue === undefined) {
        return cond.operator === 'notExists';
      }
      // 将嵌套值包装为 frontmatter 格式以便复用逻辑
      targetFrontmatter = { __nested__: nestedValue };
      targetCond = { ...cond, key: '__nested__' };
    }

    const keyEntries = this.findMatchingKeys(targetFrontmatter, targetCond);

    if (keyEntries.length === 0) {
      return cond.operator === 'notExists';
    }

    switch (cond.operator) {
      case 'exists':
        return keyEntries.length > 0;
      case 'notExists':
        return false;

      default:
        const matchMode = cond.arrayMatchMode ?? 'any';
        const checkFn = matchMode === 'all'
          ? (results: boolean[]) => results.every(r => r)
          : (results: boolean[]) => results.some(r => r);

        return checkFn(
          keyEntries.map(({ value }) => this.compareValueWithOperator(value, cond))
        );
    }
  }

  private findMatchingKeys(
    frontmatter: Record<string, unknown>,
    cond: YamlCondition
  ): Array<{ key: string; value: unknown }> {
    if (cond.key) {
      if (frontmatter[cond.key] !== undefined) {
        return [{ key: cond.key, value: frontmatter[cond.key] }];
      }
      return [];
    }

    if (cond.keyCondition) {
      return this.findKeysByPattern(frontmatter, cond.keyCondition);
    }

    return [];
  }

  private findKeysByPattern(
    frontmatter: Record<string, unknown>,
    keyCond: YamlKeyCondition
  ): Array<{ key: string; value: unknown }> {
    const matches: Array<{ key: string; value: unknown }> = [];

    for (const [key, value] of Object.entries(frontmatter)) {
      if (this.isKeyMatch(key, keyCond.matchMode, keyCond.pattern)) {
        matches.push({ key, value });
      }
    }

    return matches;
  }

  private isKeyMatch(key: string, mode: KeyMatchMode, pattern: string): boolean {
    switch (mode) {
      case 'exact':
        return key === pattern;
      case 'prefix':
        return key.startsWith(pattern);
      case 'suffix':
        return key.endsWith(pattern);
      case 'contains':
        return key.includes(pattern);
      case 'regex':
        try {
          return new RegExp(pattern).test(key);
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  /**
   * 增强的 YAML 类型推断 - 支持 Obsidian 所有属性类型
   */
  private inferYamlType(value: unknown, key?: string): YamlValueType {
    if (value === null || value === undefined) return 'unknown';
    if (typeof value === 'boolean') return 'checkbox';
    if (typeof value === 'number') return 'number';
    if (Array.isArray(value)) {
      // 根据 key 和数组内容推断具体类型
      if (key === 'tags') return 'tags';
      if (key === 'aliases') return 'aliases';
      if (key === 'cssclasses') return 'list';
      return 'list';
    }
    if (typeof value === 'string') {
      // 尝试推断日期格式
      if (this.isDateString(value)) return 'date';
      if (this.isDateTimeString(value)) return 'datetime';
      if (value.includes('\n')) return 'multitext';
      return 'text';
    }
    return 'unknown';
  }

  /**
   * 检查是否为日期字符串 (YYYY-MM-DD)
   */
  private isDateString(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  /**
   * 检查是否为日期时间字符串 (ISO 8601)
   */
  private isDateTimeString(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
  }

  /**
   * 解析日期字符串为 Date 对象
   */
  private parseDate(value: string): Date | null {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * 获取嵌套属性的值
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[key];
    }

    return current;
  }

  private compareValueWithOperator(actualValue: unknown, cond: YamlCondition): boolean {
    const inferredType = cond.valueType || this.inferYamlType(actualValue, cond.key);
    const condValue = cond.value ?? null;
    const options: YamlValueOptions = {
      caseSensitive: false,
      trimWhitespace: true,
      fuzzyMatch: false,
    };

    switch (inferredType) {
      case 'number':
        return this.compareNumericValue(actualValue, cond.operator, condValue);

      case 'checkbox':
        return this.compareBooleanValue(actualValue, cond.operator, condValue);

      case 'date':
      case 'datetime':
        return this.compareDateValue(actualValue, cond.operator, condValue);

      case 'list':
      case 'tags':
      case 'aliases':
        return this.evaluateArrayCondition(actualValue as unknown[], cond);

      case 'text':
      case 'multitext':
      default:
        return this.compareTextValue(actualValue, cond.operator, condValue, options);
    }
  }

  /**
   * 比较数值
   */
  private compareNumericValue(actualValue: unknown, operator: YamlOperator, condValue: YamlValue | null): boolean {
    const numValue = typeof actualValue === 'number' ? actualValue : parseFloat(String(actualValue));
    const condNum = typeof condValue === 'number' ? condValue : parseFloat(String(condValue));

    if (isNaN(numValue) || isNaN(condNum)) return false;

    switch (operator) {
      case 'equals': return numValue === condNum;
      case 'notEquals': return numValue !== condNum;
      case 'gt': return numValue > condNum;
      case 'gte': return numValue >= condNum;
      case 'lt': return numValue < condNum;
      case 'lte': return numValue <= condNum;
      case 'between':
        if (Array.isArray(condValue) && condValue.length >= 2) {
          const min = typeof condValue[0] === 'number' ? condValue[0] : parseFloat(String(condValue[0]));
          const max = typeof condValue[1] === 'number' ? condValue[1] : parseFloat(String(condValue[1]));
          return !isNaN(min) && !isNaN(max) && numValue >= min && numValue <= max;
        }
        return false;
      default:
        return false;
    }
  }

  /**
   * 比较布尔值
   */
  private compareBooleanValue(actualValue: unknown, operator: YamlOperator, condValue: YamlValue | null): boolean {
    const boolValue = typeof actualValue === 'boolean' ? actualValue : String(actualValue).toLowerCase() === 'true';
    const condBool = typeof condValue === 'boolean' ? condValue : String(condValue).toLowerCase() === 'true';

    switch (operator) {
      case 'equals': return boolValue === condBool;
      case 'notEquals': return boolValue !== condBool;
      case 'exists': return actualValue !== undefined && actualValue !== null;
      case 'notExists': return actualValue === undefined || actualValue === null;
      default:
        return false;
    }
  }

  /**
   * 比较日期值
   */
  private compareDateValue(actualValue: unknown, operator: YamlOperator, condValue: YamlValue | null): boolean {
    const actualDate = this.parseDate(String(actualValue));
    const condDate = this.parseDate(String(condValue));

    if (!actualDate || !condDate) return false;

    // 对于纯日期比较，忽略时间部分
    const actualTime = actualDate.getTime();
    const condTime = condDate.getTime();

    switch (operator) {
      case 'equals': return actualTime === condTime;
      case 'notEquals': return actualTime !== condTime;
      case 'gt': return actualTime > condTime;
      case 'gte': return actualTime >= condTime;
      case 'lt': return actualTime < condTime;
      case 'lte': return actualTime <= condTime;
      case 'between':
        if (Array.isArray(condValue) && condValue.length >= 2) {
          const start = this.parseDate(String(condValue[0]));
          const end = this.parseDate(String(condValue[1]));
          if (start && end) {
            return actualTime >= start.getTime() && actualTime <= end.getTime();
          }
        }
        return false;
      default:
        return false;
    }
  }

  /**
   * 比较文本值
   */
  private compareTextValue(
    actualValue: unknown,
    operator: YamlOperator,
    condValue: YamlValue | null,
    options: YamlValueOptions
  ): boolean {
    let strValue = String(actualValue ?? '');
    let condStr = String(condValue ?? '');

    if (options.trimWhitespace) {
      strValue = strValue.trim();
      condStr = condStr.trim();
    }

    if (!options.caseSensitive) {
      strValue = strValue.toLowerCase();
      condStr = condStr.toLowerCase();
    }

    switch (operator) {
      case 'equals': return strValue === condStr;
      case 'notEquals': return strValue !== condStr;
      case 'contains': return strValue.includes(condStr);
      case 'startsWith': return strValue.startsWith(condStr);
      case 'endsWith': return strValue.endsWith(condStr);
      case 'matches':
        try {
          const flags = options.regexFlags || '';
          const regex = new RegExp(condStr, flags);
          return regex.test(strValue);
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  private compareNumeric(value: number, operator: YamlOperator, condValue: number): boolean {
    switch (operator) {
      case 'equals':
        return value === condValue;
      case 'notEquals':
        return value !== condValue;
      case 'gt':
        return value > condValue;
      case 'gte':
        return value >= condValue;
      case 'lt':
        return value < condValue;
      case 'lte':
        return value <= condValue;
      case 'between':
        if (Array.isArray(condValue)) {
          const [min, max] = condValue;
          return value >= min && value <= max;
        }
        return false;
      default:
        return false;
    }
  }

  private evaluateArrayCondition(arr: unknown[], cond: YamlCondition): boolean {
    const condValue = cond.value;

    switch (cond.operator) {
      case 'arrayContains':
        return arr.some(item => String(item) === String(condValue));

      case 'arrayNotContains':
        return !arr.some(item => String(item) === String(condValue));

      case 'arrayHasAny': {
        const values = Array.isArray(condValue) ? condValue : [condValue];
        return values.some(v => arr.some(item => String(item) === String(v)));
      }

      case 'arrayHasAll': {
        const values = Array.isArray(condValue) ? condValue : [condValue];
        return values.every(v => arr.some(item => String(item) === String(v)));
      }

      case 'contains':
        return arr.some(item => String(item).includes(String(condValue)));

      case 'equals':
        return this.compareArraysEqual(arr, Array.isArray(condValue) ? condValue : [condValue]);

      case 'notEquals':
        return !this.compareArraysEqual(arr, Array.isArray(condValue) ? condValue : [condValue]);

      default:
        return false;
    }
  }

  private compareArraysEqual(arr1: unknown[], arr2: unknown[]): boolean {
    if (arr1.length !== arr2.length) return false;
    return arr1.every((item, i) => String(item) === String(arr2[i]));
  }

  private compareScalarValue(
    actualValue: unknown,
    operator: YamlOperator,
    condValue: string | number | boolean | undefined
  ): boolean {
    if (operator === 'exists') return true;
    if (operator === 'notExists') return false;

    const actualStr = String(actualValue);
    const condStr = String(condValue ?? '');

    switch (operator) {
      case 'equals':
        return actualStr === condStr;
      case 'notEquals':
        return actualStr !== condStr;
      case 'contains':
        return actualStr.includes(condStr);
      case 'startsWith':
        return actualStr.startsWith(condStr);
      case 'endsWith':
        return actualStr.endsWith(condStr);
      case 'matches':
        try {
          return new RegExp(condStr).test(actualStr);
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  private evaluateMtimeCondition(condition: Condition, file?: TFile): boolean {
    if (!file || !condition.mtimePattern) return false;

    const match = condition.mtimePattern.match(/^([<>=])(\d+)([mhdwM])$/);
    if (!match) return false;

    const [, operatorStr, amountStr, unit] = match;
    const amount = parseInt(amountStr, 10);
    const mtime = file.stat.mtime;
    const now = Date.now();
    const diffMs = now - mtime;

    const unitMs: Record<string, number> = {
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000,
      M: 30 * 24 * 60 * 60 * 1000,
    };

    const threshold = amount * (unitMs[unit] || unitMs['d']);

    switch (operatorStr) {
      case '<':
        return diffMs < threshold;
      case '>':
        return diffMs > threshold;
      case '=':
        return Math.abs(diffMs - threshold) < (unitMs[unit] || unitMs['d']);
      default:
        return false;
    }
  }

  private evaluatePathCondition(condition: Condition, file?: TFile): boolean {
    if (!file || !condition.pathPattern) return false;

    try {
      const regex = new RegExp(condition.pathPattern);
      return regex.test(file.path);
    } catch {
      return false;
    }
  }

  private getFailureReason(condition: Condition): string {
    switch (condition.type) {
      case 'tag':
        return `标签不匹配: ${condition.tag}`;
      case 'title':
        return `标题不匹配: ${condition.pattern}`;
      case 'yaml':
        return `YAML 条件不满足`;
      case 'mtime':
        return `修改时间不满足: ${condition.mtimePattern}`;
      case 'path':
        return `路径不匹配: ${condition.pathPattern}`;
      case 'content':
        return `正文内容不匹配: ${condition.contentPattern}`;
      default:
        return '未知条件类型';
    }
  }
}
