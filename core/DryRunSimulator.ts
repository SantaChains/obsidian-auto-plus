// ***************************************************************************************
// * Dry Run 模拟器 v1.0
// * 执行前预览所有操作结果，不实际修改文件
// ***************************************************************************************

import { App, TFile } from 'obsidian';
import { DryRunConfig, Rule, Condition } from './types';
import { ConditionEvaluator } from './ConditionEvaluator';

export interface PlannedAction {
  type: string;
  description: string;
  target: string;
  willCreate?: boolean;
  willModify?: boolean;
  willDelete?: boolean;
}

export interface YamlChange {
  file: TFile;
  adds: Record<string, unknown>;
  updates: Record<string, unknown>;
  deletes: string[];
}

export interface DryRunResult {
  matchedFiles: TFile[];
  plannedActions: PlannedAction[];
  yamlChanges: YamlChange[];
  errors: string[];
}

export class DryRunSimulator {
  private app: App;
  private config: DryRunConfig;
  private evaluator: ConditionEvaluator;

  constructor(config: DryRunConfig, app: App) {
    this.config = config;
    this.app = app;
    this.evaluator = new ConditionEvaluator({ useRegexForTags: false });
  }

  async simulate(rule: Rule, files: TFile[]): Promise<DryRunResult> {
    const result: DryRunResult = {
      matchedFiles: [],
      plannedActions: [],
      yamlChanges: [],
      errors: [],
    };

    if (!this.config.enabled) {
      result.errors.push('Dry Run 功能未启用');
      return result;
    }

    for (const file of files) {
      const fileCache = this.app.metadataCache.getFileCache(file);
      const tags = fileCache ? [...(fileCache.tags || [])].map((t: { tag: string }) => t.tag) : [];

      let isMatched = true;
      for (const condition of rule.conditions) {
        const evalResult = this.evaluator.evaluate(
          condition,
          file.basename,
          tags,
          fileCache,
          file
        );
        if (!evalResult.matched) {
          isMatched = false;
          break;
        }
      }

      if (isMatched) {
        result.matchedFiles.push(file);

        const action = this.planAction(rule, file);
        if (action) {
          result.plannedActions.push(action);
        }

        if (rule.action === 'updateYaml' && rule.target.updateYamlKey) {
          result.yamlChanges.push({
            file,
            adds: {},
            updates: { [rule.target.updateYamlKey]: rule.target.updateYamlValue || '' },
            deletes: [],
          });
        }
      }
    }

    return result;
  }

  private planAction(rule: Rule, file: TFile): PlannedAction | null {
    const actionType = rule.action;

    switch (actionType) {
      case 'move':
        return {
          type: 'move',
          description: `移动文件到 ${rule.target.destinationFolder || '/'}`,
          target: rule.target.destinationFolder || '/',
          willModify: true,
        };
      case 'copy':
        return {
          type: 'copy',
          description: `复制文件到 ${rule.target.destinationFolder || '/'}`,
          target: rule.target.destinationFolder || '/',
          willCreate: true,
        };
      case 'rename':
        return {
          type: 'rename',
          description: `重命名为 ${rule.target.targetFileName || file.basename + '_new'}`,
          target: rule.target.targetFileName || file.basename + '_new',
          willModify: true,
        };
      case 'delete':
        return {
          type: 'delete',
          description: '删除文件',
          target: file.path,
          willDelete: true,
        };
      case 'updateYaml':
        return {
          type: 'updateYaml',
          description: `更新 YAML 属性 ${rule.target.updateYamlKey}`,
          target: file.path,
          willModify: true,
        };
      case 'addTag':
        return {
          type: 'addTag',
          description: `添加标签 ${rule.target.tagValue}`,
          target: file.path,
          willModify: true,
        };
      default:
        return null;
    }
  }

  async previewActions(rule: Rule, files: TFile[]): Promise<DryRunResult> {
    return this.simulate(rule, files);
  }

  formatResult(result: DryRunResult): string {
    const lines: string[] = [];

    lines.push(`匹配文件: ${result.matchedFiles.length}`);
    lines.push(`计划操作: ${result.plannedActions.length}`);

    if (result.yamlChanges.length > 0) {
      lines.push('\nYAML 变更:');
      for (const change of result.yamlChanges) {
        lines.push(`  - ${change.file.name}:`);
        for (const [key, value] of Object.entries(change.updates)) {
          lines.push(`      ${key}: ${value}`);
        }
      }
    }

    if (result.errors.length > 0) {
      lines.push('\n错误:');
      for (const error of result.errors) {
        lines.push(`  - ${error}`);
      }
    }

    return lines.join('\n');
  }
}