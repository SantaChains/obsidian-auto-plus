import AutoNoteMover from '../../main';
import { Rule } from '../../core/types';

export interface ImportExportCallbacks {
  showNotice: (message: string) => void;
  refreshUI: () => void;
}

export class ImportExportService {
  constructor(
    private plugin: AutoNoteMover,
    private callbacks: ImportExportCallbacks
  ) {}

  async exportRules(): Promise<void> {
    const data = JSON.stringify(this.plugin.settings.rules, null, 2);
    await navigator.clipboard.writeText(data);
    this.callbacks.showNotice('规则已复制到剪贴板');
  }

  async importRules(): Promise<void> {
    try {
      const clipboardText = await navigator.clipboard.readText();
      const importedRules = JSON.parse(clipboardText);

      if (!Array.isArray(importedRules)) {
        this.callbacks.showNotice('导入失败：剪贴板内容不是有效的规则数组');
        return;
      }

      const validRules = importedRules.filter((r: any) => r.name && r.action);
      if (validRules.length === 0) {
        this.callbacks.showNotice('导入失败：未找到有效的规则');
        return;
      }

      const generateId = () => {
        return `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      };

      for (const rule of validRules) {
        rule.id = generateId();
      }

      this.plugin.settings.rules.push(...validRules);
      await this.plugin.saveSettings();
      this.callbacks.showNotice(`成功导入 ${validRules.length} 条规则`);
      this.callbacks.refreshUI();
    } catch (error) {
      this.callbacks.showNotice(`导入失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  validateRule(rule: any): rule is Rule {
    return (
      rule &&
      typeof rule.name === 'string' &&
      typeof rule.action === 'string' &&
      Array.isArray(rule.conditions) &&
      typeof rule.logicOperator === 'string'
    );
  }

  exportRulesToFile(rules: Rule[], filename: string): string {
    return JSON.stringify(rules, null, 2);
  }

  importRulesFromFile(content: string): Rule[] {
    try {
      const rules = JSON.parse(content);
      if (!Array.isArray(rules)) {
        throw new Error('无效的规则文件格式');
      }
      
      const validRules = rules.filter((r: any) => this.validateRule(r));
      if (validRules.length === 0) {
        throw new Error('文件中没有有效的规则');
      }
      
      return validRules;
    } catch (error) {
      throw new Error(`解析失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }
}
