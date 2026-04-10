// ***************************************************************************************
// * 主入口文件 v2.0
// * 职责：插件生命周期管理、事件绑定、协调核心层
// ***************************************************************************************

import { MarkdownView, Plugin, TFile, Notice, TAbstractFile, normalizePath, getAllTags, CachedMetadata, Modal } from 'obsidian';
import { RuleEngine, RuleEngineOptions } from './core/RuleEngine';
import { ActionExecutor, ExecutorOptions } from './core/ActionExecutor';
import { TaskScheduler } from './core/Scheduler';
import { FileService } from './services/FileService';
import { PluginSettings, Rule, BatchMode, BatchStats, BatchProcessResult, BatchPreviewResult, FileProcessResult, DEFAULT_SETTINGS } from './core/types';
import { AutoNoteMoverSettingTab } from './settings/SettingsTab';
import { getTriggerIndicator, isFmDisable, arrayMove } from './utils/helpers';

export default class AutoNoteMover extends Plugin {
  settings!: PluginSettings;
  public ruleEngine!: RuleEngine;
  private actionExecutor!: ActionExecutor;
  private fileService!: FileService;
  private scheduler!: TaskScheduler;
  private triggerIndicator: HTMLElement | null = null;

  public getFileService(): FileService {
    return this.fileService;
  }

  async onload() {
    await this.loadSettings();
    this.initializeServices();
    this.registerEventHandlers();
    this.registerCommands();
    this.setupScheduler();
    this.setupStatusBar();
    this.loadStyles();
    this.addSettingTab(new AutoNoteMoverSettingTab(this.app, this));
  }

  onunload() {
    this.scheduler?.stop();
    this.triggerIndicator = null;
    this.unloadStyles();
  }

  private loadStyles(): void {
    const styleEl = document.createElement('style');
    styleEl.id = 'auto-plus-modern-styles';
    styleEl.textContent = `
      /* Auto Plus Modern UI Styles */
      .auto-plus-settings-header {
        margin-bottom: 24px !important;
      }

      .auto-plus-title {
        font-size: 24px !important;
        font-weight: 700 !important;
        color: var(--text-normal) !important;
        letter-spacing: -0.02em !important;
      }

      .auto-plus-quick-actions {
        background: linear-gradient(135deg, var(--background-primary) 0%, var(--background-secondary) 100%) !important;
        border: 1px solid var(--background-modifier-border) !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;
        backdrop-filter: blur(8px) !important;
      }

      .auto-plus-quick-actions button {
        transition: all 0.2s ease !important;
        font-weight: 500 !important;
        border: 1px solid transparent !important;
      }

      .auto-plus-quick-actions button:hover {
        transform: translateY(-1px) !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
      }

      .auto-plus-rule-card {
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        overflow: hidden !important;
      }

      .auto-plus-rule-card:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08) !important;
      }

      .auto-plus-rule-header {
        transition: background 0.2s ease !important;
        cursor: pointer !important;
      }

      .auto-plus-rule-header:hover {
        background: var(--background-modifier-hover) !important;
      }

      .auto-plus-rule-actions button {
        width: 32px !important;
        height: 32px !important;
        border-radius: 6px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: all 0.2s ease !important;
        background: transparent !important;
        color: var(--text-muted) !important;
      }

      .auto-plus-rule-actions button:hover {
        background: var(--background-modifier-hover) !important;
        color: var(--text-normal) !important;
        transform: scale(1.05) !important;
      }

      .auto-plus-rule-actions button.auto-plus-delete-btn:hover {
        background: rgba(239, 68, 68, 0.1) !important;
        color: #ef4444 !important;
      }

      .auto-plus-condition-item {
        transition: all 0.2s ease !important;
        position: relative !important;
      }

      .auto-plus-condition-item::before {
        content: '' !important;
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        bottom: 0 !important;
        width: 3px !important;
        border-radius: 3px !important;
        background: currentColor !important;
        opacity: 0.6 !important;
      }

      .auto-plus-condition-item:hover {
        transform: translateX(4px) !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06) !important;
      }

      .setting-item {
        padding: 12px 0 !important;
        border-bottom: 1px solid var(--background-modifier-border-hover) !important;
        transition: background 0.2s ease !important;
      }

      .setting-item:hover {
        background: var(--background-modifier-hover) !important;
        margin: 0 -12px !important;
        padding-left: 12px !important;
        padding-right: 12px !important;
        border-radius: 6px !important;
      }

      .setting-item-name {
        font-weight: 500 !important;
        color: var(--text-normal) !important;
        transition: color 0.2s ease !important;
      }

      .setting-item:hover .setting-item-name {
        color: var(--text-accent) !important;
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .auto-plus-rule-card,
      .auto-plus-global-settings,
      .auto-plus-excluded-settings {
        animation: slideIn 0.3s ease !important;
      }
    `;
    document.head.appendChild(styleEl);
  }

  private unloadStyles(): void {
    const styleEl = document.getElementById('auto-plus-modern-styles');
    if (styleEl) {
      styleEl.remove();
    }
  }

  private initializeServices(): void {
    this.fileService = new FileService(this.app);

    const engineOptions: RuleEngineOptions = {
      useRegexForTags: this.settings.useRegexForTags,
      allowMultipleActions: this.settings.allowMultipleActions,
    };
    this.ruleEngine = new RuleEngine(this.app, engineOptions);
    this.ruleEngine.setRules(this.settings.rules);

    const executorOptions: ExecutorOptions = {
      showNotifications: this.settings.showNotifications,
      notificationPrefix: 'Auto Plus',
    };
    this.actionExecutor = new ActionExecutor(this.app, executorOptions);
  }

  private updateServices(): void {
    this.ruleEngine.setOptions({
      useRegexForTags: this.settings.useRegexForTags,
      allowMultipleActions: this.settings.allowMultipleActions,
    });
    this.ruleEngine.setRules(this.settings.rules);

    this.actionExecutor.setOptions({
      showNotifications: this.settings.showNotifications,
    });

    // 更新调度器
    this.setupScheduler();
  }

  /**
   * 设置定时任务调度器
   */
  private setupScheduler(): void {
    if (!this.scheduler) {
      this.scheduler = new TaskScheduler(this.app, this);
    }

    // 重新注册所有定时规则
    const scheduledRules = this.settings.rules.filter(
      r => r.enabled && r.triggerMode === 'scheduled' && r.schedule
    );

    scheduledRules.forEach(rule => this.scheduler.register(rule));

    // 启动调度器
    this.scheduler.start();
    console.log(`[Auto Plus] 调度器已启动，${scheduledRules.length} 个定时任务`);
  }

  private registerEventHandlers(): void {
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(this.app.vault.on('create', (file) => this.handleFileEvent(file)));
      this.registerEvent(this.app.metadataCache.on('changed', (file) => this.handleFileEvent(file)));
      this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.handleRenameEvent(file, oldPath)));
    });
  }

  private registerCommands(): void {
    // 注册全局移动命令
    this.addCommand({
      id: 'Move-the-note',
      name: '移动当前笔记',
      checkCallback: (checking: boolean) => {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView) {
          if (!checking) {
            this.executeManualCommand(markdownView);
          }
          return true;
        }
        return false;
      },
    });

    // 为每个手动规则注册独立命令
    this.registerManualRuleCommands();

    // 查看定时任务状态
    this.addCommand({
      id: 'view-scheduled-tasks',
      name: '查看定时任务状态',
      callback: () => this.viewScheduledTasks(),
    });

    this.addCommand({
      id: 'Toggle-Auto-Manual',
      name: '切换自动/手动模式',
      callback: () => this.toggleTriggerMode(),
    });

    this.addCommand({
      id: 'Batch-Backtrace-Process',
      name: '批量回溯处理笔记',
      checkCallback: (checking: boolean) => {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView || this.settings.rules.length > 0) {
          if (!checking) {
            this.showBatchProcessModal();
          }
          return true;
        }
        return false;
      },
    });
  }

  /**
   * 为所有手动触发模式的规则注册独立命令
   */
  private registerManualRuleCommands(): void {
    const manualRules = this.settings.rules.filter(
      r => r.enabled && r.triggerMode === 'manual'
    );

    for (const rule of manualRules) {
      if (!rule.id) continue;

      const commandId = `execute-rule-${rule.id}`;
      const commandName = `执行规则: ${rule.name}`;

      this.addCommand({
        id: commandId,
        name: commandName,
        checkCallback: (checking: boolean) => {
          const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (markdownView) {
            if (!checking) {
              this.executeManualRule(rule, markdownView.file);
            }
            return true;
          }
          return false;
        },
      });
    }
  }

  /**
   * 执行单个手动规则
   */
  private async executeManualRule(rule: Rule, file: TFile | null): Promise<void> {
    if (!file) {
      new Notice('没有打开的文件');
      return;
    }

    const fileCache = this.app.metadataCache.getFileCache(file);
    const results = this.ruleEngine.evaluateFile(file, fileCache);

    // 只执行指定的手动规则
    const targetResult = results.find(r => r.rule.id === rule.id && r.matched);

    if (targetResult) {
      await this.actionExecutor.execute({ rule, file, fileFullName: file.basename + '.' + file.extension });
    } else {
      new Notice(`规则 "${rule.name}" 不匹配当前文件`);
    }
  }

  /**
   * 执行定时规则（public 供 Scheduler 调用）
   */
  public async executeScheduledRule(ruleId: string): Promise<void> {
    const rule = this.settings.rules.find(r => r.id === ruleId);
    if (!rule) {
      console.error('[Auto Plus] 未找到定时规则:', ruleId);
      return;
    }

    console.log(`[Auto Plus] 执行定时规则：${rule.name}`);

    // 获取所有文件并执行
    const files = this.app.vault.getMarkdownFiles();
    let executedCount = 0;

    for (const file of files) {
      const fileCache = this.app.metadataCache.getFileCache(file);
      const results = this.ruleEngine.evaluateFile(file, fileCache);

      const targetResult = results.find(r => r.rule.id === rule.id && r.matched);
      if (targetResult) {
        await this.actionExecutor.execute({ rule, file, fileFullName: file.basename + '.' + file.extension });
        executedCount++;
      }
    }

    new Notice(`定时规则 "${rule.name}" 执行完成，处理了 ${executedCount} 个文件`);
  }

  private setupStatusBar(): void {
    if (!this.settings.statusBarIndicator) return;

    this.triggerIndicator = this.addStatusBarItem();
    this.updateStatusBar();
  }

  updateStatusBar(): void {
    if (this.triggerIndicator) {
      this.triggerIndicator.setText(getTriggerIndicator(this.settings.triggerMode));
    }
  }

  private handleFileEvent(file: TAbstractFile, caller?: string): void {
    if (this.settings.triggerMode !== 'auto' && caller !== 'cmd') return;
    if (!(file instanceof TFile)) return;

    if (this.isExcludedFolder(file)) return;

    const fileCache = this.app.metadataCache.getFileCache(file);
    if (isFmDisable(fileCache)) return;

    // 只处理自动模式的规则
    this.processFileWithAutoRules(file, fileCache);
  }

  /**
   * 只处理自动触发模式的规则
   */
  private async processFileWithAutoRules(file: TFile, fileCache: CachedMetadata | null): Promise<void> {
    const autoRules = this.settings.rules.filter(
      r => r.enabled && (r.triggerMode === 'auto' || !r.triggerMode)
    );

    if (autoRules.length === 0) return;

    // 临时设置只包含自动规则的规则引擎
    const originalRules = this.settings.rules;
    this.ruleEngine.setRules(autoRules);

    const results = this.ruleEngine.evaluateFile(file, fileCache);

    for (const result of results) {
      if (result.matched) {
        await this.actionExecutor.execute({ rule: result.rule, file, fileFullName: file.basename + '.' + file.extension });
        if (!this.settings.allowMultipleActions) break;
      }
    }

    // 恢复原始规则
    this.ruleEngine.setRules(originalRules);
  }

  private handleRenameEvent(file: TAbstractFile, oldPath: string): void {
    if (!(file instanceof TFile)) return;
    const oldFileName = oldPath.split('/').pop() || '';
    const newFileName = file.basename + '.' + file.extension;
    if (oldFileName === newFileName) return;
    this.handleFileEvent(file);
  }

  private isExcludedFolder(file: TFile): boolean {
    if (!file.parent) return false;

    const globalExclude = this.settings.globalExclude;
    if (globalExclude.folders.length > 0) {
      const parentPath = file.parent.path;
      for (const folder of globalExclude.folders) {
        if (globalExclude.useRegex) {
          try {
            if (new RegExp(folder).test(parentPath)) return true;
          } catch {
            continue;
          }
        } else {
          if (parentPath === folder || parentPath.startsWith(folder + '/')) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private async processFile(file: TFile, fileCache: CachedMetadata | null): Promise<void> {
    const results = this.ruleEngine.evaluateFile(file, fileCache);

    for (const result of results) {
      if (result.matched) {
        await this.actionExecutor.execute({
          rule: result.rule,
          file,
          fileFullName: file.name,
        });
      }
    }
  }

  /**
   * 查看定时任务状态
   */
  private viewScheduledTasks(): void {
    const tasks = this.scheduler?.getTasks() || [];
    
    if (tasks.length === 0) {
      new Notice('暂无定时任务');
      return;
    }

    const taskInfo = tasks.map(task => {
      const nextRun = task.nextRun ? new Date(task.nextRun).toLocaleString() : '未设置';
      const lastRun = task.lastRun ? new Date(task.lastRun).toLocaleString() : '未执行';
      return `${task.ruleName}\n  下次执行：${nextRun}\n  上次执行：${lastRun}`;
    }).join('\n\n');

    // 创建模态框显示
    const modal = new Modal(this.app);
    modal.titleEl.setText('定时任务状态');
    
    const content = modal.contentEl.createDiv();
    content.style.cssText = 'white-space: pre-wrap; font-family: monospace; font-size: 13px;';
    content.setText(taskInfo);
    
    modal.open();
  }

  private executeManualCommand(view: MarkdownView): void {
    const file = view.file;
    if (!file) return;

    if (isFmDisable(this.app.metadataCache.getFileCache(file))) {
      new Notice('自动笔记移动已在 frontmatter 中禁用。');
      return;
    }

    this.handleFileEvent(file, 'cmd');
  }

  private toggleTriggerMode(): void {
    if (this.settings.triggerMode === 'auto') {
      this.settings.triggerMode = 'manual';
      new Notice('[自动笔记移动]\n触发模式已设为手动。');
    } else {
      this.settings.triggerMode = 'auto';
      new Notice('[自动笔记移动]\n触发模式已设为自动。');
    }
    this.saveData(this.settings);
    this.updateStatusBar();
  }

  private async showBatchProcessModal(): Promise<void> {
    const rules = this.settings.rules;
    if (rules.length === 0) {
      new Notice('[Auto Plus]\n没有可用的规则');
      return;
    }

    const ruleOptions: Record<string, string> = {};
    ruleOptions['all'] = '全部规则';
    rules.forEach((rule, index) => {
      ruleOptions[String(index)] = rule.name || `规则 ${index + 1}`;
    });

    new Notice('[Auto Plus]\n正在扫描笔记文件...');

    const allFiles = this.fileService.getAllMarkdownFiles();
    const processableFiles = allFiles.filter(file => {
      if (this.isExcludedFolder(file)) return false;
      const cache = this.app.metadataCache.getFileCache(file);
      return !isFmDisable(cache);
    });

    new Notice(`[Auto Plus]\n找到 ${processableFiles.length} 个可处理文件\n请在设置中完成批量处理`);

    const ruleIndex = await this.showSelectModal(ruleOptions);
    if (ruleIndex === null) return;

    const selectedRule = ruleIndex === 'all' ? null : rules[parseInt(ruleIndex)];
    await this.performBatchPreview(selectedRule, processableFiles);
  }

  private showSelectModal(options: Record<string, string>): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);
      modal.titleEl.textContent = '批量处理';
      modal.contentEl.createEl('p', { text: '选择要应用的规则：' });

      Object.entries(options).forEach(([value, label]) => {
        const btn = modal.contentEl.createEl('button', { text: label, cls: 'batch-preview-btn' });
        btn.onclick = () => {
          modal.close();
          resolve(value);
        };
      });

      modal.onClose = () => {
        if (!(modal as any).selected) resolve(null);
      };
      modal.open();
    });
  }

  private async performBatchPreview(rule: Rule | null, files: TFile[]): Promise<void> {
    const results: BatchPreviewResult[] = [];
    const rulesToCheck = rule ? [rule] : this.settings.rules;

    for (let i = 0; i < rulesToCheck.length; i++) {
      const r = rulesToCheck[i];
      this.ruleEngine.setRules([r]);
      const matchedFiles: TFile[] = [];

      for (const file of files) {
        const cache = this.app.metadataCache.getFileCache(file);
        const matchResults = this.ruleEngine.evaluateFile(file, cache);
        if (matchResults.some(m => m.matched)) {
          matchedFiles.push(file);
        }
      }

      results.push({
        ruleId: r.id || String(i),
        ruleName: r.name || `规则 ${i + 1}`,
        matchedFiles,
        total: matchedFiles.length,
      });
    }

    this.ruleEngine.setRules(this.settings.rules);

    await this.showPreviewModal(results);
  }

  private async showPreviewModal(results: BatchPreviewResult[]): Promise<void> {
    const modal = new Modal(this.app);
    modal.titleEl.textContent = '批量处理预览';
    modal.contentEl.empty();

    const totalMatched = results.reduce((sum, r) => sum + r.total, 0);

    modal.contentEl.createEl('p', {
      text: `共 ${results.length} 条规则，匹配 ${totalMatched} 个文件`,
    });

    const listEl = modal.contentEl.createEl('div', { cls: 'batch-preview-container' });

    results.forEach(result => {
      const itemEl = listEl.createEl('div', { cls: 'batch-preview-item' });

      itemEl.createEl('strong', { text: result.ruleName });
      itemEl.createEl('span', { text: ` - ${result.total} 个文件` });

      if (result.total > 0) {
        const fileList = result.matchedFiles.slice(0, 5).map(f => f.name).join(', ');
        const more = result.total > 5 ? ` 等${result.total}个` : '';
        itemEl.createEl('small', { text: `\n${fileList}${more}` });
      }
    });

    const btnContainer = modal.contentEl.createDiv('batch-preview-btn-container');

    const previewBtn = btnContainer.createEl('button', { text: '执行处理', cls: 'batch-preview-btn-flex' });
    previewBtn.onclick = () => {
      modal.close();
      this.performBatchExecute(results);
    };

    const cancelBtn = btnContainer.createEl('button', { text: '取消', cls: 'batch-preview-btn-flex' });
    cancelBtn.onclick = () => modal.close();

    modal.open();
  }

  private async performBatchExecute(previewResults: BatchPreviewResult[]): Promise<void> {
    const allResults: BatchProcessResult[] = [];
    const stats: BatchStats = { total: 0, matched: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0 };

    for (const preview of previewResults) {
      if (preview.total === 0) continue;

      const rule = this.settings.rules.find(r => (r.id || '') === (preview.ruleId || ''));
      if (!rule) continue;

      stats.matched += preview.total;
      stats.total += preview.total;

      const results: FileProcessResult[] = [];
      const ruleResults: BatchProcessResult = {
        ruleId: preview.ruleId,
        ruleName: preview.ruleName,
        mode: 'execute',
        matchedFiles: preview.matchedFiles,
        results,
        stats: { total: preview.total, matched: preview.total, processed: 0, succeeded: 0, failed: 0, skipped: 0 },
        startTime: new Date(),
      };

      for (const file of preview.matchedFiles) {
        try {
          const actionResult = await this.actionExecutor.execute({
            rule,
            file,
            fileFullName: file.name,
          });

          results.push({
            file,
            success: actionResult.success,
            action: actionResult.action,
            message: actionResult.message,
            error: actionResult.error,
          });

          if (actionResult.success) {
            stats.succeeded++;
            ruleResults.stats.succeeded++;
          } else {
            stats.failed++;
            ruleResults.stats.failed++;
          }
          stats.processed++;
          ruleResults.stats.processed++;
        } catch (error) {
          results.push({
            file,
            success: false,
            error: String(error),
          });
          stats.failed++;
          stats.processed++;
          ruleResults.stats.failed++;
          ruleResults.stats.processed++;
        }
      }

      ruleResults.endTime = new Date();
      allResults.push(ruleResults);
    }

    this.showBatchResultModal(stats, allResults);
  }

  private showBatchResultModal(stats: BatchStats, allResults: BatchProcessResult[]): void {
    const modal = new Modal(this.app);
    modal.titleEl.textContent = '批量处理完成';

    modal.contentEl.empty();

    modal.contentEl.createEl('h3', { text: '处理统计' });
    const statsEl = modal.contentEl.createEl('div', { cls: 'batch-stats' });
    statsEl.innerHTML = `
      <div>匹配文件: <strong>${stats.matched}</strong></div>
      <div>处理成功: <strong style="color: green">${stats.succeeded}</strong></div>
      <div>处理失败: <strong style="color: red">${stats.failed}</strong></div>
    `;

    if (allResults.length > 0) {
      modal.contentEl.createEl('h3', { text: '详细结果' });
      const listEl = modal.contentEl.createEl('div', { cls: 'batch-detail-list' });

      allResults.forEach(result => {
        result.results.forEach(r => {
          if (!r.success) {
            const itemEl = listEl.createEl('div', { cls: 'batch-error-item' });
            itemEl.textContent = `${r.file.name}: ${r.error || '未知错误'}`;
          }
        });
      });
    }

    const closeBtn = modal.contentEl.createEl('button', { text: '关闭', cls: 'batch-close-btn' });
    closeBtn.onclick = () => modal.close();

    modal.open();

    new Notice(`[Auto Plus]\n批量处理完成\n成功: ${stats.succeeded}, 失败: ${stats.failed}`);
  }

  async loadSettings() {
    const loadedData = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData || {});
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.updateServices();
  }
}
