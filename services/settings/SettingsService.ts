import { Notice } from 'obsidian';
import AutoNoteMover from '../../main';
import { Rule, Condition, PluginSettings } from '../../core/types';

export interface UICallbacks {
  showNotice: (message: string) => void;
  refreshUI: () => void;
}

export class SettingsService {
  constructor(
    private plugin: AutoNoteMover,
    private uiCallbacks: UICallbacks
  ) {}

  createDefaultRule(): Rule {
    return {
      id: '',
      name: '',
      enabled: true,
      priority: this.plugin.settings.rules.length,
      triggerMode: 'auto',
      conditions: [],
      logicOperator: 'AND',
      action: 'move',
      target: {},
      sourceFilter: { mode: 'all', folders: [] },
      excludeFolders: [],
    };
  }

  createDefaultCondition(): Condition {
    return {
      type: 'tag',
      tag: '',
    };
  }

  generateId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  async addRule(rule: Rule): Promise<string> {
    rule.id = this.generateId();
    this.plugin.settings.rules.push(rule);
    await this.plugin.saveSettings();
    return rule.id;
  }

  async updateRule(ruleId: string, updates: Partial<Rule>): Promise<void> {
    const rule = this.plugin.settings.rules.find(r => r.id === ruleId);
    if (rule) {
      Object.assign(rule, updates);
      await this.plugin.saveSettings();
    }
  }

  async deleteRule(ruleId: string): Promise<void> {
    this.plugin.settings.rules = this.plugin.settings.rules.filter(r => r.id !== ruleId);
    await this.plugin.saveSettings();
  }

  async moveRule(ruleId: string, direction: number): Promise<void> {
    const index = this.plugin.settings.rules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      const newIndex = index + direction;
      if (newIndex >= 0 && newIndex < this.plugin.settings.rules.length) {
        const { arrayMove } = await import('../../utils/helpers');
        arrayMove(this.plugin.settings.rules, index, newIndex);
        await this.plugin.saveSettings();
      }
    }
  }

  canMoveUp(ruleId: string): boolean {
    const index = this.plugin.settings.rules.findIndex(r => r.id === ruleId);
    return index > 0;
  }

  canMoveDown(ruleId: string): boolean {
    const index = this.plugin.settings.rules.findIndex(r => r.id === ruleId);
    return index < this.plugin.settings.rules.length - 1;
  }

  async updateGlobalSetting<K extends keyof PluginSettings>(
    key: K,
    value: PluginSettings[K]
  ): Promise<void> {
    (this.plugin.settings as any)[key] = value;
    await this.plugin.saveSettings();
  }
}
