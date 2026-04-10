// ***************************************************************************************
// * 规则引擎 v2.1
// * 负责管理规则和评估文件是否匹配规则
// * 支持多条件组合、源文件夹过滤、循环执行
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
  LoopConfig,
} from './types';
import { ConditionEvaluator, EvaluatorOptions } from './ConditionEvaluator';
import { LoopExecutor, LoopResult } from './LoopExecutor';

export interface RuleEngineOptions extends EvaluatorOptions {
  allowMultipleActions: boolean;
}

export interface LoopExecutionResult {
  success: boolean;
  ruleId: string;
  iterations: number;
  results: unknown[];
  error?: string;
}

export class RuleEngine {
  private rules: Rule[] = [];
  private evaluator: ConditionEvaluator;
  private options: RuleEngineOptions;
  private loopCache: Map<string, LoopExecutor> = new Map();
  private app: import('obsidian').App;

  constructor(app: import('obsidian').App, options: RuleEngineOptions = { useRegexForTags: false, allowMultipleActions: false }) {
    this.app = app;
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

  /**
   * 检查规则是否配置了循环
   */
  hasLoopConfig(rule: Rule): boolean {
    return rule.loopConfig !== undefined && rule.loopConfig !== null;
  }

  /**
   * 执行带循环的规则
   * @param rule 要执行的规则
   * @param files 要处理的文件列表
   * @param executor 每个文件的执行回调
   * @returns 循环执行结果
   */
  async executeWithLoop(
    rule: Rule,
    files: TFile[],
    executor: (file: TFile, context: FileContext) => Promise<unknown>
  ): Promise<LoopExecutionResult> {
    const loopConfig = rule.loopConfig;

    if (!loopConfig) {
      return {
        success: false,
        ruleId: rule.id || '',
        iterations: 0,
        results: [],
        error: 'No loop configuration found',
      };
    }

    const loopExecutor = new LoopExecutor(loopConfig, async (item, loopContext) => {
      const file = item as TFile;
      if (!(file instanceof TFile)) {
        return { error: 'Invalid item: not a TFile' };
      }

      const fileCache = this.app?.metadataCache.getFileCache(file);
      const context = this.createFileContext(file, fileCache);

      try {
        return await executor(file, context);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    const loopResult: LoopResult = await loopExecutor.execute(files);

    return {
      success: loopResult.success,
      ruleId: rule.id || '',
      iterations: loopResult.iterations,
      results: loopResult.outputs,
      error: loopResult.error,
    };
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
