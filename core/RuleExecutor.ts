// ***************************************************************************************
// * RuleExecutor 规则执行器
// * 负责执行匹配到的规则，支持循环、条件分支、错误恢复
// * 适配 core/types.ts 中的 Rule 和 ActionContext 类型
// ***************************************************************************************

import { TFile, Notice } from 'obsidian';
import {
  Rule,
  RuleMatchResult,
  ActionContext,
  ActionResult,
  LoopConfig,
  ErrorHandling,
  BatchProgress,
} from './types';
import { LoopExecutor } from './LoopExecutor';
import { ActionExecutor } from './ActionExecutor';
import { BatchProgressManager } from './BatchProgressManager';

export interface ExecutionResult {
  success: boolean;
  ruleId: string;
  ruleName: string;
  processedFiles: number;
  results: Array<{
    file: string;
    success: boolean;
    error?: string;
  }>;
  dryRun?: boolean;
}

export interface RuleExecutorOptions {
  dryRun?: boolean;
  showProgress?: boolean;
  errorHandling?: ErrorHandling;
  batchProgress?: BatchProgress;
}

export class RuleExecutor {
  private app: import('obsidian').App;
  private actionExecutor: ActionExecutor;
  private progressManager?: BatchProgressManager;
  private options: RuleExecutorOptions;

  constructor(
    app: import('obsidian').App,
    options: RuleExecutorOptions = {}
  ) {
    this.app = app;
    this.actionExecutor = new ActionExecutor(app);
    this.options = options;

    if (options.batchProgress?.enabled) {
      this.progressManager = new BatchProgressManager(options.batchProgress);
    }
  }

  /**
   * 执行规则到匹配的文件
   */
  async execute(
    rule: Rule,
    files: TFile[],
    ruleMatchResults?: RuleMatchResult[]
  ): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      success: true,
      ruleId: rule.id || '',
      ruleName: rule.name,
      processedFiles: 0,
      results: [],
    };

    // 开始进度
    if (this.progressManager) {
      this.progressManager.start(files.length, `执行规则: ${rule.name}`);
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // 检查是否取消
      if (this.progressManager?.isCancelled()) {
        result.success = false;
        break;
      }

      // 更新进度
      if (this.progressManager) {
        this.progressManager.update(i + 1, file.path);
      }

      // 创建 ActionContext
      const context: ActionContext = {
        rule,
        file,
        fileFullName: file.name,
      };

      // 执行操作
      try {
        const execResult = await this.executeAction(context, rule);
        result.results.push({
          file: file.path,
          success: execResult.success,
          error: execResult.error,
        });

        if (!execResult.success && this.options.errorHandling?.strategy === 'stop') {
          result.success = false;
          break;
        }
      } catch (error) {
        result.results.push({
          file: file.path,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        result.success = false;
      }
    }

    result.processedFiles = files.length;

    // 完成进度
    if (this.progressManager) {
      if (result.success) {
        this.progressManager.complete();
      } else {
        this.progressManager.error('执行被中断');
      }
    }

    return result;
  }

  /**
   * 执行单个操作
   */
  private async executeAction(
    context: ActionContext,
    rule: Rule
  ): Promise<ActionResult> {
    try {
      return await this.actionExecutor.execute(context);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // 根据错误处理策略处理
      if (this.options.errorHandling?.strategy === 'retry') {
        const maxRetries = this.options.errorHandling.maxRetries ?? 3;
        const retryDelay = this.options.errorHandling.retryDelay ?? 1000;
        
        for (let i = 0; i < maxRetries; i++) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * (i + 1)));
          try {
            return await this.actionExecutor.execute(context);
          } catch {
            // 继续重试
          }
        }
      }
      
      return { success: false, action: rule.action, fileName: context.fileFullName, error: errorMsg };
    }
  }

  /**
   * 带循环的执行
   */
  async executeWithLoop(
    rule: Rule,
    files: TFile[],
    loopConfig: LoopConfig
  ): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      success: true,
      ruleId: rule.id || '',
      ruleName: rule.name,
      processedFiles: 0,
      results: [],
    };

    const loopExecutor = new LoopExecutor(loopConfig, async (item, loopContext) => {
      if (loopContext.index > 0 && this.progressManager) {
        this.progressManager.update(loopContext.index, String(item));
      }

      const file = item as TFile;
      if (!file || !(file instanceof TFile)) {
        return { success: false, error: 'Invalid item in loop' };
      }

      const context: ActionContext = {
        rule,
        file,
        fileFullName: file.name,
      };

      return this.executeAction(context, rule);
    });

    // 开始进度
    if (this.progressManager) {
      this.progressManager.start(files.length, `执行规则: ${rule.name}`);
    }

    const loopResult = await loopExecutor.execute(files);

    result.processedFiles = loopResult.iterations;
    result.results = loopResult.outputs.map((out, i) => ({
      file: files[i]?.path || `index-${i}`,
      success: !(out && typeof out === 'object' && 'error' in out),
      error: out && typeof out === 'object' && 'error' in out ? String((out as { error: unknown }).error) : undefined,
    }));

    if (loopResult.error) {
      result.success = false;
    }

    // 完成进度
    if (this.progressManager) {
      this.progressManager.complete();
    }

    return result;
  }

  /**
   * Dry Run 模拟执行
   */
  async dryRun(
    rule: Rule,
    files: TFile[]
  ): Promise<ExecutionResult> {
    const dryRunResult: ExecutionResult = {
      success: true,
      ruleId: rule.id || '',
      ruleName: rule.name,
      processedFiles: files.length,
      results: files.map(f => ({
        file: f.path,
        success: true,
      })),
      dryRun: true,
    };

    return dryRunResult;
  }

  /**
   * 取消执行
   */
  cancel(): void {
    this.progressManager?.requestCancel();
  }
}

export default RuleExecutor;
