// ***************************************************************************************
// * 条件评估器 v2.0
// * 负责评估单个条件是否匹配
// * 支持：类型推断、Key模式匹配、数组操作、数值比较
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
} from './types';

export interface EvaluatorOptions {
  useRegexForTags: boolean;
}

type TimeUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

export class ConditionEvaluator {
  private options: EvaluatorOptions;

  constructor(options: EvaluatorOptions = { useRegexForTags: false }) {
    this.options = options;
  }

  setOptions(options: Partial<EvaluatorOptions>): void {
    this.options = { ...this.options, ...options };
  }

  evaluate(
    condition: Condition,
    fileName: string,
    cacheTag: string[] | null,
    fileCache: CachedMetadata | null,
    file?: TFile
  ): EvaluationResult {
    const matched = this.evaluateCondition(condition, fileName, cacheTag, fileCache, file);
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
    file?: TFile
  ): boolean {
    switch (condition.type) {
      case 'tag':
        return this.evaluateTagCondition(condition, cacheTag);
      case 'title':
        return this.evaluateTitleCondition(condition, fileName);
      case 'yaml':
        return this.evaluateYamlCondition(condition, fileCache);
      case 'mtime':
        return this.evaluateMtimeCondition(condition, file);
      case 'path':
        return this.evaluatePathCondition(condition, file);
      default:
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

    const keyEntries = this.findMatchingKeys(frontmatter, cond);

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

  private inferYamlType(value: unknown): YamlValueType {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (Array.isArray(value)) return 'array';
    return 'string';
  }

  private compareValueWithOperator(actualValue: unknown, cond: YamlCondition): boolean {
    const inferredType = this.inferYamlType(actualValue);
    const condValue = cond.value;

    if (inferredType === 'number' && typeof condValue === 'number') {
      return this.compareNumeric(actualValue as number, cond.operator, condValue);
    }

    if (inferredType === 'array') {
      return this.evaluateArrayCondition(actualValue as unknown[], cond);
    }

    if (inferredType === 'boolean' || inferredType === 'string') {
      return this.compareScalarValue(actualValue, cond.operator, condValue);
    }

    if (inferredType === 'null' && cond.operator === 'notExists') {
      return true;
    }

    return false;
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
      default:
        return '未知条件类型';
    }
  }
}
