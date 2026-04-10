// ***************************************************************************************
// * DataService 数据服务
// * 封装数据持久化操作，集成 Schema 验证
// ***************************************************************************************

import { App, Notice, TFile } from 'obsidian';
import { Rule, Action, Template, Settings, DEFAULT_SETTINGS } from '../core/types';
import { validatePluginData, validateRule, validateAction, ValidationResult } from '../core/SchemaValidator';

export interface PluginData {
  version: string;
  rules: Rule[];
  actions: Action[];
  templates: Template[];
  settings: Settings;
}

export class DataService {
  private app: App;
  private dataPath: string = '.obsidian/note-mv-plus';

  constructor(app: App) {
    this.app = app;
  }

  /**
   * 加载数据
   */
  async loadData(): Promise<PluginData> {
    try {
      const file = this.app.vault.getAbstractFileByPath(`${this.dataPath}/data.json`);
      if (file instanceof TFile) {
        const content = await this.app.vault.read(file);
        const data = JSON.parse(content) as PluginData;
        return this.ensureDefaultData(data);
      }
    } catch (error) {
      console.error('[DataService] 加载数据失败:', error);
    }
    return this.getDefaultData();
  }

  /**
   * 保存数据
   */
  async saveData(data: PluginData): Promise<{ success: boolean; error?: string }> {
    try {
      // Schema 验证
      const validation = validatePluginData(data);
      if (!validation.valid) {
        const errorMsg = validation.errors.map(e => e.message).join(', ');
        new Notice(`数据验证失败: ${errorMsg}`, 5000);
        return { success: false, error: errorMsg };
      }

      // 确保目录存在
      await this.ensureDataDirectory();

      // 写入数据
      const filePath = `${this.dataPath}/data.json`;
      const content = JSON.stringify(data, null, 2);
      const file = this.app.vault.getAbstractFileByPath(filePath);
      
      if (file instanceof TFile) {
        await this.app.vault.modify(file, content);
      } else {
        await this.app.vault.create(filePath, content);
      }

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[DataService] 保存数据失败:', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 保存规则（带验证）
   */
  async saveRule(rule: Rule): Promise<{ success: boolean; error?: string }> {
    const validation = validateRule(rule);
    if (!validation.valid) {
      const errorMsg = validation.errors.map(e => e.message).join(', ');
      new Notice(`规则验证失败: ${errorMsg}`, 5000);
      return { success: false, error: errorMsg };
    }

    const data = await this.loadData();
    const index = data.rules.findIndex(r => r.id === rule.id);
    if (index >= 0) {
      data.rules[index] = rule;
    } else {
      data.rules.push(rule);
    }

    return this.saveData(data);
  }

  /**
   * 保存操作（带验证）
   */
  async saveAction(action: Action): Promise<{ success: boolean; error?: string }> {
    const validation = validateAction(action);
    if (!validation.valid) {
      const errorMsg = validation.errors.map(e => e.message).join(', ');
      new Notice(`操作验证失败: ${errorMsg}`, 5000);
      return { success: false, error: errorMsg };
    }

    const data = await this.loadData();
    const index = data.actions.findIndex(a => a.id === action.id);
    if (index >= 0) {
      data.actions[index] = action;
    } else {
      data.actions.push(action);
    }

    return this.saveData(data);
  }

  /**
   * 删除规则
   */
  async deleteRule(ruleId: string): Promise<{ success: boolean; error?: string }> {
    const data = await this.loadData();
    data.rules = data.rules.filter(r => r.id !== ruleId);
    return this.saveData(data);
  }

  /**
   * 删除操作
   */
  async deleteAction(actionId: string): Promise<{ success: boolean; error?: string }> {
    const data = await this.loadData();
    data.actions = data.actions.filter(a => a.id !== actionId);
    return this.saveData(data);
  }

  /**
   * 导出数据
   */
  async exportData(): Promise<string> {
    const data = await this.loadData();
    return JSON.stringify(data, null, 2);
  }

  /**
   * 导入数据
   */
  async importData(jsonStr: string): Promise<{ success: boolean; error?: string }> {
    try {
      const data = JSON.parse(jsonStr) as PluginData;
      return await this.saveData(data);
    } catch (error) {
      return { success: false, error: '无效的 JSON 格式' };
    }
  }

  /**
   * 获取默认数据
   */
  private getDefaultData(): PluginData {
    return {
      version: '1.0.0',
      rules: [],
      actions: [],
      templates: [],
      settings: { ...DEFAULT_SETTINGS },
    };
  }

  /**
   * 确保数据有默认值
   */
  private ensureDefaultData(data: Partial<PluginData>): PluginData {
    const defaults = this.getDefaultData();
    const settings = { ...defaults.settings, ...data.settings };
    if (data.settings?.logRetention) {
      settings.logRetention = { ...defaults.settings.logRetention, ...data.settings.logRetention };
    }
    return {
      ...defaults,
      ...data,
      settings,
    };
  }

  /**
   * 确保数据目录存在
   */
  private async ensureDataDirectory(): Promise<void> {
    const dir = this.app.vault.getAbstractFileByPath(this.dataPath);
    if (!dir) {
      await this.app.vault.createFolder(this.dataPath);
    }
  }
}

export default DataService;
