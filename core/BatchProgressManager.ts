// ***************************************************************************************
// * 批量进度管理器
// * 提供批量操作进度显示和取消功能
// ***************************************************************************************

import { Modal, setIcon } from 'obsidian';
import { BatchProgress } from './types';

// ============================================================================
// 类型定义
// ============================================================================

export interface ProgressUpdate {
  current: number;
  total: number;
  percentage: number;
  currentFile?: string;
  message?: string;
}

export type ProgressCallback = (update: ProgressUpdate) => void;
export type CancelCallback = () => void;

// ============================================================================
// 进度对话框 Modal
// ============================================================================

class ProgressModal extends Modal {
  private progressBarEl!: HTMLElement;
  private percentageEl!: HTMLElement;
  private currentFileEl!: HTMLElement;
  private cancelBtnEl!: HTMLElement;
  private messageEl!: HTMLElement;
  private isHidden: boolean = false;
  private titleText: string;
  private cancelable: boolean;
  private onCancelCallback: CancelCallback;

  constructor(
    app: import('obsidian').App,
    title: string,
    canCancel: boolean,
    onCancel: CancelCallback
  ) {
    super(app);
    this.titleText = title;
    this.cancelable = canCancel;
    this.onCancelCallback = onCancel;
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.createDiv('batch-progress-title', (el) => {
      el.setText(this.titleText);
    });

    contentEl.createDiv('batch-progress-divider');

    const progressContainer = contentEl.createDiv('batch-progress-track');
    this.progressBarEl = progressContainer.createDiv('batch-progress-fill');
    this.percentageEl = contentEl.createDiv('batch-progress-text');

    this.currentFileEl = contentEl.createDiv('batch-progress-current');

    this.messageEl = contentEl.createDiv('batch-progress-message');

    if (this.cancelable) {
      this.cancelBtnEl = contentEl.createDiv('batch-progress-cancel-btn', (el) => {
        el.setText('取消');
        el.addEventListener('click', () => {
          this.onCancelCallback();
        });
      });
    }

    this.updateStyles();
  }

  private updateStyles(): void {
    const style = document.createElement('style');
    style.id = 'batch-progress-styles';
    if (document.getElementById('batch-progress-styles')) return;
    style.textContent = `
      .batch-progress-container { padding: 16px; }
      .batch-progress-title { font-size: 16px; font-weight: bold; margin-bottom: 12px; }
      .batch-progress-divider { height: 1px; background: #e0e0e0; margin: 12px 0; }
      .batch-progress-track { height: 8px; background: #f0f0f0; border-radius: 4px; overflow: hidden; }
      .batch-progress-fill { height: 100%; background: #7c3aed; transition: width 0.2s; width: 0%; }
      .batch-progress-text { text-align: center; margin-top: 8px; font-size: 14px; color: #666; }
      .batch-progress-current { margin-top: 8px; font-size: 12px; color: #999; word-break: break-all; }
      .batch-progress-message { margin-top: 8px; font-size: 12px; color: #666; }
      .batch-progress-cancel-btn { margin-top: 12px; padding: 8px 16px; background: #fee2e2; color: #dc2626; border: none; border-radius: 4px; cursor: pointer; }
      .batch-progress-cancel-btn:hover { background: #fecaca; }
    `;
    document.head.appendChild(style);
  }

  updateProgress(update: ProgressUpdate): void {
    const percentage = Math.round(update.percentage);
    this.progressBarEl.style.width = `${percentage}%`;
    this.percentageEl.setText(`${percentage}% (${update.current}/${update.total})`);
    if (update.currentFile) {
      this.currentFileEl.setText(update.currentFile);
    }
    if (update.message) {
      this.messageEl.setText(update.message);
    }
  }

  hideModal(): void {
    this.isHidden = true;
    this.close();
  }

  onClose(): void {
    const style = document.getElementById('batch-progress-styles');
    if (style) {
      style.remove();
    }
  }
}

// ============================================================================
// 批量进度管理器
// ============================================================================

export class BatchProgressManager {
  private progress: ProgressUpdate = { current: 0, total: 0, percentage: 0 };
  private cancelled: boolean = false;
  private modal: ProgressModal | null = null;
  private progressCallback?: ProgressCallback;
  private cancelCallback?: CancelCallback;

  constructor(
    private config: BatchProgress,
    onProgress?: ProgressCallback,
    onCancel?: CancelCallback
  ) {
    this.progressCallback = onProgress;
    this.cancelCallback = onCancel;
  }

  start(total: number, message?: string): void {
    this.progress = {
      current: 0,
      total,
      percentage: 0,
      message,
    };
    this.cancelled = false;

    if (this.config.showDialog) {
      this.showDialog();
    }
  }

  update(current: number, currentFile?: string): void {
    this.progress.current = current;
    this.progress.percentage = this.progress.total > 0 ? (current / this.progress.total) * 100 : 0;
    this.progress.currentFile = currentFile;

    if (this.progressCallback) {
      this.progressCallback(this.progress);
    }

    if (this.modal) {
      this.modal.updateProgress(this.progress);
    }
  }

  complete(message?: string): void {
    this.progress.current = this.progress.total;
    this.progress.percentage = 100;
    if (message) {
      this.progress.message = message;
    }

    if (this.progressCallback) {
      this.progressCallback(this.progress);
    }

    if (this.modal) {
      this.modal.updateProgress(this.progress);
      setTimeout(() => {
        this.hideDialog();
      }, 1000);
    }
  }

  error(message: string): void {
    this.progress.message = `错误: ${message}`;
    if (this.modal) {
      this.modal.updateProgress(this.progress);
    }
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  requestCancel(): void {
    this.cancelled = true;
    if (this.cancelCallback) {
      this.cancelCallback();
    }
  }

  showDialog(): void {
    if (!this.modal) {
      this.modal = new ProgressModal(
        this.config.showDialog ? (window as unknown as { app: import('obsidian').App }).app : null as unknown as import('obsidian').App,
        '批量操作进度',
        this.config.canCancel,
        () => this.requestCancel()
      );
    }
    this.modal.open();
  }

  hideDialog(): void {
    if (this.modal) {
      this.modal.hideModal();
      this.modal = null;
    }
  }
}
