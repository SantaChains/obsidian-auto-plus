// ***************************************************************************************
// * 规则引擎 v2.0
// * 负责管理规则和评估文件是否匹配规则
// * 支持多条件组合、源文件夹过滤
// ***************************************************************************************

import { TFile, CachedMetadata, getAllTags } from 'obsidian';
import {
  Rule,
  RuleMatchResult,
  EvaluationResult,
  FileContext,
  LogicOperator,
  Condition,
  SourceFolderRule,
} from './types';
import { ConditionEvaluator, EvaluatorOptions } from './ConditionEvaluator';

export interface RuleEngineOptions extends EvaluatorOptions {
  allowMultipleActions: boolean;
}

export class RuleEngine {
  private rules: Rule[] = [];
  private evaluator: ConditionEvaluator;
  private options: RuleEngineOptions;

  constructor(options: RuleEngineOptions = { useRegexForTags: false, allowMultipleActions: false }) {
    this.options = options;
    this.evaluator = new ConditionEvaluator({ useRegexForTags: options.useRegexForTags });
  }

  setRules(rules: Rule[] | undefined | null): void {
    this.rules = [...(rules || [])].sort((a, b) => a.priority - b.priority);
  }

  getRules(): Rule[] {
    return [...this.rules];
  }

  setOptions(options: Partial<RuleEngineOptions>): void {
    this.options = { ...this.options, ...options };
    this.evaluator.setOptions({ useRegexForTags: this.options.useRegexForTags });
  }

  evaluateFile(file: TFile, fileCache: CachedMetadata | null): RuleMatchResult[] {
    const context = this.createFileContext(file, fileCache);
    const results: RuleMatchResult[] = [];

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const sourceIncluded = this.isSourceIncluded(file, rule);
      if (!sourceIncluded) continue;

      const result = this.evaluateRule(rule, context);
      if (result.matched) {
        results.push(result);
        if (!this.options.allowMultipleActions) {
          break;
        }
      }
    }

    return results;
  }

  private evaluateRule(rule: Rule, context: FileContext): RuleMatchResult {
    const matchedConditions: EvaluationResult[] = [];

    if (rule.conditions.length === 0) {
      return { matched: false, rule, matchedConditions };
    }

    const matched = this.evaluateMultipleConditions(
      rule.conditions,
      rule.logicOperator,
      context,
      matchedConditions
    );

    return { matched, rule, matchedConditions };
  }

  private evaluateMultipleConditions(
    conditions: Condition[],
    logicOperator: LogicOperator,
    context: FileContext,
    results: EvaluationResult[]
  ): boolean {
    if (conditions.length === 0) {
      return false;
    }

    for (const cond of conditions) {
      const result = this.evaluator.evaluate(
        cond,
        context.fileName,
        context.tags,
        context.fileCache,
        context.file
      );
      results.push(result);
    }

    if (logicOperator === 'AND') {
      return results.every(r => r.matched);
    } else {
      return results.some(r => r.matched);
    }
  }

  private createFileContext(file: TFile, fileCache: CachedMetadata | null): FileContext {
    return {
      file,
      fileName: file.basename,
      fileFullName: file.name,
      fileCache,
      tags: fileCache ? getAllTags(fileCache) : null,
      frontmatter: fileCache?.frontmatter ?? null,
    };
  }

  private isSourceIncluded(file: TFile, rule: Rule): boolean {
    const ruleExclude = rule.excludeFolders ?? [];
    if (ruleExclude.length > 0) {
      const parentPath = file.parent?.path || '';
      for (const folder of ruleExclude) {
        if (parentPath === folder || parentPath.startsWith(folder + '/')) {
          return false;
        }
      }
    }

    const sourceFilter = rule.sourceFilter;
    if (!sourceFilter || sourceFilter.mode === 'all') {
      return true;
    }

    const parentPath = file.parent?.path || '';

    switch (sourceFilter.mode) {
      case 'include':
        return this.isPathMatch(parentPath, sourceFilter);

      case 'exclude':
        return !this.isPathMatch(parentPath, sourceFilter);

      default:
        return true;
    }
  }

  private isPathMatch(path: string, sourceFilter: SourceFolderRule): boolean {
    return sourceFilter.folders.some(folder => {
      if (sourceFilter.useRegex) {
        try {
          return new RegExp(folder).test(path);
        } catch {
          return false;
        }
      }

      if (sourceFilter.includeChildren) {
        return path === folder || path.startsWith(folder + '/');
      }

      return path === folder;
    });
  }
}
