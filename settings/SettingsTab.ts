import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import AutoNoteMover from '../main';
import { Rule } from '../core/types';
import { SettingsService } from '../services/settings/SettingsService';
import { RuleTestService } from '../services/settings/RuleTestService';
import { ImportExportService } from '../services/settings/ImportExportService';
import { QuickActionsComponent } from '../components/settings/QuickActionsComponent';
import { GlobalSettingsComponent } from '../components/settings/GlobalSettingsComponent';
import { RuleCardComponent } from '../components/settings/RuleCardComponent';
import { ExcludedFoldersComponent } from '../components/settings/ExcludedFoldersComponent';

export class AutoNoteMoverSettingTab extends PluginSettingTab {
  plugin: AutoNoteMover;
  private settingsService: SettingsService;
  private ruleTestService: RuleTestService;
  private importExportService: ImportExportService;
  private ruleCards: Map<string, RuleCardComponent> = new Map();
  private expandedRules: Set<string> = new Set();

  constructor(app: App, plugin: AutoNoteMover) {
    super(app, plugin);
    this.plugin = plugin;
    
    this.settingsService = new SettingsService(plugin, {
      showNotice: (message) => new Notice(message),
      refreshUI: () => this.display(),
    });
    
    this.ruleTestService = new RuleTestService(plugin);
    
    this.importExportService = new ImportExportService(plugin, {
      showNotice: (message) => new Notice(message),
      refreshUI: () => this.display(),
    });
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderQuickActions();
    this.renderGlobalSettings();
    this.renderRuleList();
    this.renderExcludedFolders();
  }

  private renderQuickActions(): void {
    new QuickActionsComponent(this.containerEl, {
      onAddRule: () => this.handleAddRule(),
      onImportRules: () => this.handleImportRules(),
      onExportRules: () => this.handleExportRules(),
      onTestRules: () => this.handleTestRules(),
    });
  }

  private renderGlobalSettings(): void {
    new GlobalSettingsComponent(this.containerEl, {
      settings: this.plugin.settings,
      onSettingChange: async (key, value) => {
        await this.settingsService.updateGlobalSetting(key, value);
        if (key === 'triggerMode' || key === 'statusBarIndicator') {
          this.plugin.updateStatusBar?.();
        }
      },
    });
  }

  private renderRuleList(): void {
    new Setting(this.containerEl).setName('规则列表').setHeading();

    if (this.plugin.settings.rules.length === 0) {
      this.renderEmptyState();
      return;
    }

    this.plugin.settings.rules.forEach((rule, index) => {
      this.renderRuleCard(rule, index);
    });
  }

  private renderEmptyState(): void {
    const empty = this.containerEl.createDiv('auto-plus-empty-state');
    empty.style.textAlign = 'center';
    empty.style.padding = '40px';
    empty.style.color = 'var(--text-muted)';
    empty.createEl('p', { text: '暂无规则，点击上方「新建规则」开始创建' });
  }

  private renderRuleCard(rule: Rule, index: number): void {
    const isExpanded = this.expandedRules.has(rule.id || '');
    
    const card = new RuleCardComponent(this.containerEl, {
      rule,
      isExpanded,
      canMoveUp: index > 0,
      canMoveDown: index < this.plugin.settings.rules.length - 1,
      onToggleExpand: (ruleId) => this.handleToggleExpand(ruleId),
      onToggleEnabled: (ruleId, enabled) => this.handleToggleEnabled(ruleId, enabled),
      onMoveUp: (ruleId) => this.handleMoveRule(ruleId, -1),
      onMoveDown: (ruleId) => this.handleMoveRule(ruleId, 1),
      onDelete: (ruleId) => this.handleDeleteRule(ruleId),
      onTest: (rule) => this.handleTestRule(rule),
    });

    this.ruleCards.set(rule.id!, card);
  }

  private renderExcludedFolders(): void {
    new ExcludedFoldersComponent(this.containerEl, this.plugin.settings.globalExclude, async (exclude) => {
      this.plugin.settings.globalExclude = exclude;
      await this.plugin.saveSettings();
    });
  }

  private async handleAddRule(): Promise<void> {
    const newRule = this.settingsService.createDefaultRule();
    const ruleId = await this.settingsService.addRule(newRule);
    this.expandedRules.add(ruleId);
    this.display();
  }

  private handleToggleExpand(ruleId: string): void {
    if (this.expandedRules.has(ruleId)) {
      this.expandedRules.delete(ruleId);
    } else {
      this.expandedRules.add(ruleId);
    }
    this.display();
  }

  private async handleToggleEnabled(ruleId: string, enabled: boolean): Promise<void> {
    await this.settingsService.updateRule(ruleId, { enabled });
    this.display();
  }

  private async handleMoveRule(ruleId: string, direction: number): Promise<void> {
    await this.settingsService.moveRule(ruleId, direction);
    this.display();
  }

  private async handleDeleteRule(ruleId: string): Promise<void> {
    await this.settingsService.deleteRule(ruleId);
    this.ruleCards.delete(ruleId);
    this.display();
  }

  private async handleTestRule(rule: Rule): Promise<void> {
    await this.ruleTestService.testSingleRule(rule, (message) => new Notice(message));
  }

  private async handleTestRules(): Promise<void> {
    await this.ruleTestService.testAllRules((message) => new Notice(message));
  }

  private async handleImportRules(): Promise<void> {
    await this.importExportService.importRules();
  }

  private async handleExportRules(): Promise<void> {
    await this.importExportService.exportRules();
  }

  hide(): void {
    this.ruleCards.forEach(card => card.destroy());
    this.ruleCards.clear();
  }
}
