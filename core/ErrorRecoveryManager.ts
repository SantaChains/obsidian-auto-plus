// ***************************************************************************************
// * 错误恢复管理器 v1.0
// * 实现错误恢复机制，支持 retry/rollback/skip/stop 策略
// ***************************************************************************************

import { App, TFile } from 'obsidian';
import { ErrorHandling, ErrorStrategy } from './types';

// ============================================================================
// 类型定义
// ============================================================================

export type ActionType = 'move' | 'copy' | 'moveRename' | 'copyRename' | 'rename' | 'delete' | 'updateYaml' | 'addTag';

export interface ActionParams {
  from?: string;
  to?: string;
  newName?: string;
  [key: string]: unknown;
}

export interface Action {
  type: ActionType;
  params: ActionParams;
}

export interface ActionRecord {
  action: Action;
  file?: TFile;
  result?: unknown;
  timestamp: number;
}

export interface ErrorRecoveryResult {
  recovered: boolean;
  strategy: ErrorStrategy;
  attempts: number;
  error?: string;
}

// ============================================================================
// ErrorRecoveryManager 错误恢复管理器
// ============================================================================

export class ErrorRecoveryManager {
  private actionHistory: ActionRecord[] = [];
  private pendingRollbacks: ActionRecord[] = [];

  constructor(
    private config: ErrorHandling,
    private app: App
  ) {}

  /**
   * 执行操作并处理错误
   */
  async executeWithRecovery(
    action: Action,
    executor: () => Promise<unknown>
  ): Promise<ErrorRecoveryResult> {
    const { strategy, maxRetries = 3, retryDelay = 1000 } = this.config;
    let attempts = 0;

    while (attempts <= maxRetries) {
      attempts++;

      try {
        const result = await executor();
        this.recordAction({ action, result, timestamp: Date.now() });
        return { recovered: true, strategy, attempts, error: undefined };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        // 最后一次尝试失败
        if (attempts > maxRetries) {
          return this.handleFailure(strategy, action, attempts, errorMsg);
        }

        // 根据策略处理
        if (strategy === 'retry') {
          await this.delay(retryDelay * (this.config.retryDelay ? 2 : 1) ** (attempts - 1));
        } else if (strategy === 'stop') {
          return { recovered: false, strategy, attempts, error: errorMsg };
        } else if (strategy === 'skip') {
          this.skip();
          return { recovered: true, strategy: 'skip', attempts, error: errorMsg };
        }
      }
    }

    return { recovered: false, strategy, attempts, error: 'Max retries exceeded' };
  }

  /**
   * 重试策略
   */
  private async retry(
    action: Action,
    executor: () => Promise<unknown>
  ): Promise<ErrorRecoveryResult> {
    return this.executeWithRecovery(action, executor);
  }

  /**
   * 回滚策略 - 反向执行已记录的操作
   */
  private async rollback(): Promise<void> {
    const records = [...this.pendingRollbacks].reverse();

    for (const record of records) {
      try {
        await this.reverseAction(record);
      } catch (error) {
        console.error(`Rollback failed for action:`, record, error);
      }
    }

    this.pendingRollbacks = [];
  }

  /**
   * 跳过策略
   */
  private skip(): void {
    // 跳过仅记录错误，不执行任何操作
  }

  /**
   * 处理失败情况
   */
  private async handleFailure(
    strategy: ErrorStrategy,
    action: Action,
    attempts: number,
    errorMsg: string
  ): Promise<ErrorRecoveryResult> {
    if (strategy === 'rollback' && this.config.rollbackOnFailure) {
      await this.rollback();
      return { recovered: true, strategy: 'rollback', attempts, error: errorMsg };
    }

    return { recovered: false, strategy, attempts, error: errorMsg };
  }

  /**
   * 反向执行操作（用于回滚）
   */
  private async reverseAction(record: ActionRecord): Promise<void> {
    const { action, file } = record;

    switch (action.type) {
      case 'move':
        // 反向移动: to -> from
        if (action.params.from && action.params.to && file) {
          await this.app.fileManager.renameFile(file, action.params.from);
        }
        break;

      case 'copy':
        // 删除复制的文件
        if (action.params.to && file) {
          const folder = this.app.vault.getAbstractFileByPath(action.params.to);
          if (folder instanceof TFile) {
            await this.app.vault.delete(folder, false);
          }
        }
        break;

      case 'rename':
        // 恢复原名
        if (action.params.newName && file) {
          const originalPath = file.path.replace(action.params.newName, file.name);
          await this.app.fileManager.renameFile(file, originalPath);
        }
        break;

      case 'delete':
        // 回滚删除需要缓存内容，此处简化处理
        console.warn('Rollback for delete action requires file cache');
        break;

      default:
        console.warn(`Rollback not supported for action type: ${action.type}`);
    }
  }

  /**
   * 记录操作
   */
  recordAction(record: ActionRecord): void {
    this.actionHistory.push(record);

    // 如果是写入操作，加入待回滚队列
    if (this.isWriteAction(record.action.type)) {
      this.pendingRollbacks.push(record);
    }
  }

  /**
   * 获取已记录的操作历史
   */
  getActionHistory(): ActionRecord[] {
    return [...this.actionHistory];
  }

  /**
   * 清空操作历史
   */
  clearHistory(): void {
    this.actionHistory = [];
  }

  /**
   * 获取待回滚队列
   */
  getPendingRollbacks(): ActionRecord[] {
    return [...this.pendingRollbacks];
  }

  /**
   * 清空待回滚队列
   */
  clearPendingRollbacks(): void {
    this.pendingRollbacks = [];
  }

  /**
   * 判断是否为写入操作
   */
  private isWriteAction(type: ActionType): boolean {
    return ['move', 'copy', 'moveRename', 'copyRename', 'rename', 'delete', 'updateYaml', 'addTag'].includes(type);
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
