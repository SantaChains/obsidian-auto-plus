// ***************************************************************************************
// * 主入口文件 v2.0
// * 职责：插件生命周期管理、事件绑定、协调核心层
// ***************************************************************************************

import { MarkdownView, Plugin, TFile, Notice, TAbstractFile, normalizePath, getAllTags, CachedMetadata, Modal } from 'obsidian';
import { RuleEngine, RuleEngineOptions } from './core/RuleEngine';
import { ActionExecutor, ExecutorOptions } from './core/ActionExecutor';
import { FileService } from './services/FileService';
import { PluginSettings, Rule, BatchMode, BatchStats, BatchProcessResult, BatchPreviewResult, FileProcessResult, DEFAULT_SETTINGS } from './core/types';
import { AutoNoteMoverSettingTab } from './settings/SettingsTab';
import { getTriggerIndicator, isFmDisable, arrayMove } from './utils/helpers';

export default class AutoNoteMover extends Plugin {
  settings!: PluginSettings;
  public ruleEngine!: RuleEngine;
  private actionExecutor!: ActionExecutor;
  private fileService!: FileService;
  private triggerIndicator: HTMLElement | null = null;

  public getFileService(): FileService {
    return this.fileService;
  }

  async onload() {
    await this.loadSettings();
    this.initializeServices();
    this.registerEventHandlers();
    this.registerCommands();
    this.setupStatusBar();
    this.addSettingTab(new AutoNoteMoverSettingTab(this.app, this));
  }

  onunload() {
    this.triggerIndicator = null;
  }

  private initializeServices(): void {
    this.fileService = new FileService(this.app);

    const engineOptions: RuleEngineOptions = {
      useRegexForTags: this.settings.useRegexForTags,
      allowMultipleActions: this.settings.allowMultipleActions,
    };
    this.ruleEngine = new RuleEngine(engineOptions);
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
  }

  private registerEventHandlers(): void {
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(this.app.vault.on('create', (file) => this.handleFileEvent(file)));
      this.registerEvent(this.app.metadataCache.on('changed', (file) => this.handleFileEvent(file)));
      this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.handleRenameEvent(file, oldPath)));
    });
  }

  private registerCommands(): void {
    this.addCommand({
      id: 'Move-the-note',
      name: '移动笔记',
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

    this.processFile(file, fileCache);
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
