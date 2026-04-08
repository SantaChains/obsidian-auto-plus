// ***************************************************************************************
// * 设置页面 v2.0
// * 遵循 UX 设计原则：
// *   - 信息分组清晰
// *   - 操作符合直觉
// *   - 视觉层次分明
// *   - 即时反馈
// ***************************************************************************************

import { App, Notice, PluginSettingTab, Setting, ButtonComponent, DropdownComponent, ToggleComponent } from 'obsidian';
import AutoNoteMover from '../main';
import { FolderSuggest, TagSuggest } from '../suggests/suggest';
import { arrayMove } from '../utils/helpers';
import {
  Rule,
  Condition,
  ConditionType,
  ActionType,
  YamlOperator,
  LogicOperator,
  SourceFolderMode,
  KeyMatchMode,
  YamlArrayMatchMode,
  DEFAULT_SETTINGS,
} from '../core/types';

const conditionColors: Record<string, string> = {
  tag: '#7c3aed',
  title: '#2563eb',
  yaml: '#059669',
  mtime: '#d97706',
  path: '#dc2626',
};

const actionColors: Record<string, string> = {
  move: '#3b82f6',
  copy: '#8b5cf6',
  moveRename: '#6366f1',
  copyRename: '#a855f7',
  rename: '#f59e0b',
  delete: '#ef4444',
  updateYaml: '#10b981',
  addTag: '#ec4899',
};

const statusColors = {
  enabled: '#22c55e',
  disabled: '#94a3b8',
  matched: '#3b82f6',
  error: '#ef4444',
};

export class AutoNoteMoverSettingTab extends PluginSettingTab {
  plugin: AutoNoteMover;
  private expandedRules: Set<string> = new Set();

  constructor(app: App, plugin: AutoNoteMover) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.addHeader();
    this.addQuickActions();
    this.addGlobalSettings();
    this.addRuleSettings();
    this.addExcludedFoldersSettings();
  }

  private addHeader(): void {
    const header = this.containerEl.createDiv('auto-plus-settings-header');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '16px';

    const title = header.createEl('h2', { text: 'Auto Plus', cls: 'auto-plus-title' });
    title.style.margin = '0';

    const subtitle = this.containerEl.createEl('p', {
      text: '根据规则自动管理笔记，支持移动、复制、重命名、更新属性等操作。',
      cls: 'setting-item-description',
    });
    subtitle.style.marginBottom = '20px';
  }

  private addQuickActions(): void {
    const section = this.containerEl.createDiv('auto-plus-quick-actions');
    section.style.display = 'flex';
    section.style.gap = '8px';
    section.style.marginBottom = '20px';
    section.style.padding = '12px';
    section.style.background = 'var(--background-secondary)';
    section.style.borderRadius = '6px';

    const addBtn = section.createEl('button', { text: '+ 新建规则', cls: 'mod-cta' });
    addBtn.onclick = async () => {
      const newRule = this.createDefaultRule();
      newRule.id = this.generateId();
      this.plugin.settings.rules.push(newRule);
      await this.plugin.saveSettings();
      this.expandedRules.add(newRule.id!);
      this.display();
    };

    const importBtn = section.createEl('button', { text: '导入规则' });
    importBtn.onclick = () => this.importRules();

    const exportBtn = section.createEl('button', { text: '导出规则' });
    exportBtn.onclick = () => this.exportRules();

    const testBtn = section.createEl('button', { text: '测试规则' });
    testBtn.onclick = () => this.testRules();
  }

  private addGlobalSettings(): void {
    const details = this.containerEl.createEl('details', { cls: 'auto-plus-global-settings' });
    details.style.marginBottom = '20px';

    const summary = details.createEl('summary', { text: '⚙️ 全局设置' });
    summary.style.cursor = 'pointer';
    summary.style.fontWeight = '600';
    summary.style.padding = '8px 0';

    new Setting(details)
      .setName('触发模式')
      .setDesc('自动：保存时触发；手动：通过命令触发')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('auto', '⚡ 自动')
          .addOption('manual', '🔧 手动')
          .setValue(this.plugin.settings.triggerMode)
          .onChange(async (value: string) => {
            this.plugin.settings.triggerMode = value as 'auto' | 'manual';
            await this.plugin.saveSettings();
            this.plugin.updateStatusBar?.();
          });
      });

    new Setting(details)
      .setName('执行策略')
      .setDesc('多个规则匹配时的处理方式')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('first', '仅执行第一个匹配的规则')
          .addOption('all', '执行所有匹配的规则')
          .setValue(this.plugin.settings.allowMultipleActions ? 'all' : 'first')
          .onChange(async (value: string) => {
            this.plugin.settings.allowMultipleActions = value === 'all';
            await this.plugin.saveSettings();
          });
      });

    new Setting(details)
      .setName('标签匹配使用正则')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.useRegexForTags).onChange(async (value) => {
          this.plugin.settings.useRegexForTags = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(details)
      .setName('显示操作通知')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showNotifications).onChange(async (value) => {
          this.plugin.settings.showNotifications = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(details)
      .setName('状态栏显示触发模式')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.statusBarIndicator).onChange(async (value) => {
          this.plugin.settings.statusBarIndicator = value;
          await this.plugin.saveSettings();
        });
      });
  }

  private addRuleSettings(): void {
    this.containerEl.createEl('h3', { text: '📋 规则列表', cls: 'auto-plus-section-title' });

    if (this.plugin.settings.rules.length === 0) {
      const empty = this.containerEl.createEl('div', { cls: 'auto-plus-empty-state' });
      empty.style.textAlign = 'center';
      empty.style.padding = '40px';
      empty.style.color = 'var(--text-muted)';
      empty.createEl('p', { text: '暂无规则，点击上方「新建规则」开始创建' });
      return;
    }

    this.plugin.settings.rules.forEach((rule) => {
      if (rule.id) {
        this.renderRuleCard(rule);
      }
    });
  }

  private renderRuleCard(rule: Rule): void {
    const isExpanded = this.expandedRules.has(rule.id || '');
    const isEnabled = rule.enabled !== false;

    const card = this.containerEl.createDiv('auto-plus-rule-card');
    card.style.border = `1px solid ${isEnabled ? 'var(--background-modifier-border)' : statusColors.disabled}`;
    card.style.borderRadius = '8px';
    card.style.marginBottom = '12px';
    card.style.background = isEnabled ? 'var(--background-primary)' : 'var(--background-secondary)';
    card.style.opacity = isEnabled ? '1' : '0.7';

    const statusBar = card.createDiv('auto-plus-rule-status-bar');
    statusBar.style.width = '4px';
    statusBar.style.borderRadius = '8px 0 0 8px';
    statusBar.style.background = isEnabled ? statusColors.enabled : statusColors.disabled;

    const header = card.createDiv('auto-plus-rule-header');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '12px';
    header.style.padding = '12px';
    header.style.borderBottom = isExpanded ? '1px solid var(--background-modifier-border)' : 'none';

    const toggle = header.createEl('input');
    toggle.type = 'checkbox';
    toggle.checked = isEnabled;
    toggle.style.cursor = 'pointer';
    toggle.onchange = async () => {
      rule.enabled = toggle.checked;
      await this.plugin.saveSettings();
      this.display();
    };

    const summary = header.createDiv('auto-plus-rule-summary');
    summary.style.flex = '1';
    summary.style.cursor = 'pointer';
    summary.onclick = () => {
      if (isExpanded) {
        this.expandedRules.delete(rule.id || '');
      } else {
        this.expandedRules.add(rule.id || '');
      }
      this.display();
    };

    const conditionText = this.getConditionSummary(rule);
    const actionText = this.getActionSummary(rule);
    summary.createEl('div', {
      text: `${rule.name || '未命名规则'}: ${conditionText} → ${actionText}`,
      cls: 'auto-plus-rule-title',
    });

    const actions = header.createDiv('auto-plus-rule-actions');
    actions.style.display = 'flex';
    actions.style.gap = '4px';

    const ruleIndex = this.plugin.settings.rules.findIndex(r => r.id === rule.id);
    if (ruleIndex > 0) {
      const upBtn = actions.createEl('button', { text: '↑', cls: 'clickable-icon' });
      upBtn.title = '上移';
      upBtn.onclick = async (e) => {
        e.stopPropagation();
        arrayMove(this.plugin.settings.rules, ruleIndex, ruleIndex - 1);
        await this.plugin.saveSettings();
        this.display();
      };
    }

    if (ruleIndex < this.plugin.settings.rules.length - 1) {
      const downBtn = actions.createEl('button', { text: '↓', cls: 'clickable-icon' });
      downBtn.title = '下移';
      downBtn.onclick = async (e) => {
        e.stopPropagation();
        arrayMove(this.plugin.settings.rules, ruleIndex, ruleIndex + 1);
        await this.plugin.saveSettings();
        this.display();
      };
    }

    const testBtn = actions.createEl('button', { text: '▶', cls: 'clickable-icon' });
    testBtn.title = '测试规则';
    testBtn.onclick = async (e) => {
      e.stopPropagation();
      await this.testSingleRule(rule);
    };

    const deleteBtn = actions.createEl('button', { text: '×', cls: 'clickable-icon mod-warning' });
    deleteBtn.title = '删除规则';
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm(`确定要删除规则 "${rule.name}" 吗？`)) {
        this.plugin.settings.rules = this.plugin.settings.rules.filter(r => r.id !== rule.id);
        await this.plugin.saveSettings();
        this.display();
      }
    };

    const expandIcon = header.createEl('span', { text: isExpanded ? '▼' : '▶' });
    expandIcon.style.cursor = 'pointer';
    expandIcon.style.color = 'var(--text-muted)';
    expandIcon.onclick = () => {
      if (isExpanded) {
        this.expandedRules.delete(rule.id || '');
      } else {
        this.expandedRules.add(rule.id || '');
      }
      this.display();
    };

    if (isExpanded) {
      const body = card.createDiv('auto-plus-rule-body');
      body.style.padding = '12px';
      this.renderRuleEditor(body, rule);
    }
  }

  private renderRuleEditor(container: HTMLElement, rule: Rule): void {
    const nameSetting = new Setting(container)
      .setName('规则名称')
      .addText((text) => {
        text.setPlaceholder('输入规则名称')
          .setValue(rule.name)
          .onChange(async (value) => {
            rule.name = value;
            await this.plugin.saveSettings();
          });
      });

    this.renderConditionSection(container, rule);
    this.renderActionSection(container, rule);
    this.renderSourceFilterSection(container, rule);
  }

  private renderConditionSection(container: HTMLElement, rule: Rule): void {
    const section = container.createDiv('auto-plus-section');
    section.style.marginBottom = '16px';

    const title = section.createEl('h4', { text: '📋 条件', cls: 'auto-plus-section-title' });
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '14px';
    title.style.color = 'var(--text-accent)';

    new Setting(section)
      .setName('逻辑关系')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('AND', '全部满足 (AND)')
          .addOption('OR', '任一满足 (OR)')
          .setValue(rule.logicOperator)
          .onChange(async (value: string) => {
            rule.logicOperator = value as LogicOperator;
            await this.plugin.saveSettings();
          });
      });

    if (rule.conditions.length === 0) {
      new Setting(section)
        .addButton((btn) => {
          btn.setButtonText('+ 添加条件').setCta().onClick(async () => {
            rule.conditions.push(this.createDefaultCondition());
            await this.plugin.saveSettings();
            this.display();
          });
        });
    } else {
      rule.conditions.forEach((condition, condIndex) => {
        this.renderConditionItem(section, condition, rule, condIndex);
      });

      new Setting(section)
        .addButton((btn) => {
          btn.setButtonText('+ 添加条件').setCta().onClick(async () => {
            rule.conditions.push(this.createDefaultCondition());
            await this.plugin.saveSettings();
            this.display();
          });
        });
    }
  }

  private renderConditionItem(container: HTMLElement, condition: Condition, rule: Rule, condIndex: number): void {
    const item = container.createDiv('auto-plus-condition-item');
    item.style.border = `1px dashed ${conditionColors[condition.type] || 'var(--background-modifier-border)'}`;
    item.style.borderRadius = '6px';
    item.style.padding = '12px';
    item.style.marginBottom = '8px';
    item.style.background = 'var(--background-secondary)';

    const header = item.createDiv();
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '8px';

    header.createEl('span', { text: `条件 ${condIndex + 1}`, cls: 'setting-item-name' }).style.color = conditionColors[condition.type] || '';

    const deleteBtn = header.createEl('button', { text: '删除', cls: 'mod-warning' });
    deleteBtn.style.fontSize = '11px';
    deleteBtn.onclick = async () => {
      rule.conditions.splice(condIndex, 1);
      await this.plugin.saveSettings();
      this.display();
    };

    new Setting(item)
      .setName('类型')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('tag', '🏷️ 标签')
          .addOption('title', '📝 标题正则')
          .addOption('yaml', '📊 YAML 属性')
          .addOption('mtime', '⏰ 修改时间')
          .addOption('path', '📁 文件路径')
          .setValue(condition.type)
          .onChange(async (value: string) => {
            condition.type = value as ConditionType;
            if (condition.type === 'yaml' && !condition.yaml) {
              condition.yaml = { key: '', operator: 'exists' };
            }
            await this.plugin.saveSettings();
            this.display();
          });
      });

    this.renderConditionFields(item, condition);
  }

  private renderConditionFields(container: HTMLElement, condition: Condition): void {
    switch (condition.type) {
      case 'tag':
        new Setting(container)
          .setName('标签')
          .addSearch((cb) => {
            new TagSuggest(this.plugin.app, cb.inputEl);
            cb.setPlaceholder('#标签 或 正则表达式')
              .setValue(condition.tag || '')
              .onChange(async (value) => {
                condition.tag = value.trim();
                await this.plugin.saveSettings();
              });
          });
        break;

      case 'title':
        new Setting(container)
          .setName('标题正则')
          .setDesc('使用 JavaScript 正则表达式匹配文件名')
          .addText((text) => {
            text.setPlaceholder('^\\d{4}-')
              .setValue(condition.pattern || '')
              .onChange(async (value) => {
                condition.pattern = value;
                await this.plugin.saveSettings();
              });
          });
        break;

      case 'yaml':
        this.renderYamlConditionFields(container, condition);
        break;

      case 'mtime':
        new Setting(container)
          .setName('时间条件')
          .setDesc('<30d: 30天内, >7d: 7天前, =1h: 1小时内。单位: m=分钟, h=小时, d=天, w=周, M=月')
          .addText((text) => {
            text.setPlaceholder('<30d')
              .setValue(condition.mtimePattern || '')
              .onChange(async (value) => {
                condition.mtimePattern = value;
                await this.plugin.saveSettings();
              });
          });
        break;

      case 'path':
        new Setting(container)
          .setName('路径正则')
          .setDesc('匹配文件完整路径，如 ^content/drafts/')
          .addText((text) => {
            text.setPlaceholder('^content/drafts/')
              .setValue(condition.pathPattern || '')
              .onChange(async (value) => {
                condition.pathPattern = value;
                await this.plugin.saveSettings();
              });
          });
        break;
    }
  }

  private renderYamlConditionFields(container: HTMLElement, condition: Condition): void {
    const yaml = condition.yaml || { key: '', operator: 'exists' };
    condition.yaml = yaml;

    new Setting(container)
      .setName('Key 匹配模式')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('exact', '精确匹配')
          .addOption('prefix', '前缀匹配')
          .addOption('suffix', '后缀匹配')
          .addOption('contains', '包含匹配')
          .addOption('regex', '正则匹配')
          .setValue(yaml.keyCondition?.matchMode || 'exact')
          .onChange(async (value: string) => {
            if (!yaml.keyCondition) {
              yaml.keyCondition = { matchMode: value as KeyMatchMode, pattern: '' };
            } else {
              yaml.keyCondition.matchMode = value as KeyMatchMode;
            }
            await this.plugin.saveSettings();
          });
      });

    if (yaml.keyCondition?.matchMode === 'exact') {
      new Setting(container)
        .setName('属性名')
        .addText((text) => {
          text.setPlaceholder('draft')
            .setValue(yaml.key || '')
            .onChange(async (value) => {
              yaml.key = value.trim();
              await this.plugin.saveSettings();
            });
        });
    } else {
      new Setting(container)
        .setName('Key 匹配表达式')
        .addText((text) => {
          text.setPlaceholder(yaml.keyCondition?.matchMode === 'prefix' ? 'tag-' : 'pattern')
            .setValue(yaml.keyCondition?.pattern || '')
            .onChange(async (value) => {
              if (!yaml.keyCondition) {
                yaml.keyCondition = { matchMode: 'exact', pattern: value };
              } else {
                yaml.keyCondition.pattern = value;
              }
              await this.plugin.saveSettings();
            });
        });
    }

    new Setting(container)
      .setName('比较方式')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('exists', '存在')
          .addOption('notExists', '不存在')
          .addOption('equals', '等于')
          .addOption('notEquals', '不等于')
          .addOption('gt', '大于')
          .addOption('gte', '大于等于')
          .addOption('lt', '小于')
          .addOption('lte', '小于等于')
          .addOption('contains', '包含')
          .addOption('startsWith', '开头是')
          .addOption('endsWith', '结尾是')
          .addOption('arrayContains', '数组包含')
          .addOption('arrayHasAny', '数组包含任一')
          .addOption('arrayHasAll', '数组包含全部')
          .setValue(yaml.operator)
          .onChange(async (value: string) => {
            yaml.operator = value as YamlOperator;
            await this.plugin.saveSettings();
          });
      });

    if (!['exists', 'notExists'].includes(yaml.operator)) {
      new Setting(container)
        .setName('属性值')
        .addText((text) => {
          text.setPlaceholder('true')
            .setValue(String(yaml.value ?? ''))
            .onChange(async (value) => {
              yaml.value = value;
              await this.plugin.saveSettings();
            });
        });
    }

    if (['arrayHasAny', 'arrayHasAll'].includes(yaml.operator)) {
      new Setting(container)
        .setName('数组匹配模式')
        .addDropdown((dropDown) => {
          dropDown
            .addOption('any', '任意匹配 (ANY)')
            .addOption('all', '全部匹配 (ALL)')
            .setValue(yaml.arrayMatchMode || 'any')
            .onChange(async (value: string) => {
              yaml.arrayMatchMode = value as YamlArrayMatchMode;
              await this.plugin.saveSettings();
            });
        });
    }
  }

  private renderActionSection(container: HTMLElement, rule: Rule): void {
    const section = container.createDiv('auto-plus-section');

    const title = section.createEl('h4', { text: '⚡ 操作', cls: 'auto-plus-section-title' });
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '14px';
    title.style.color = actionColors[rule.action] || 'var(--text-accent)';

    new Setting(section)
      .setName('操作类型')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('move', '📂 移动到文件夹')
          .addOption('copy', '📋 复制到文件夹')
          .addOption('moveRename', '📂➕✏️ 移动并重命名')
          .addOption('copyRename', '📋➕✏️ 复制并重命名')
          .addOption('rename', '✏️ 仅重命名')
          .addOption('delete', '🗑️ 删除文件')
          .addOption('updateYaml', '📝 更新 YAML 属性')
          .addOption('addTag', '🏷️ 添加标签')
          .setValue(rule.action)
          .onChange(async (value: string) => {
            rule.action = value as ActionType;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    const needsFolder = ['move', 'copy', 'moveRename', 'copyRename'].includes(rule.action);
    const needsFileName = ['moveRename', 'copyRename', 'rename', 'updateYaml', 'addTag'].includes(rule.action);

    if (needsFolder) {
      new Setting(section)
        .setName('目标文件夹')
        .addSearch((cb) => {
          new FolderSuggest(this.plugin.app, cb.inputEl);
          cb.setPlaceholder('选择或输入文件夹路径')
            .setValue(rule.target.destinationFolder || '')
            .onChange(async (value) => {
              rule.target.destinationFolder = value.trim();
              await this.plugin.saveSettings();
            });
        });
    }

    if (needsFileName) {
      if (rule.action === 'updateYaml') {
        new Setting(section)
          .setName('属性名')
          .addText((text) => {
            text.setPlaceholder('updated')
              .setValue(rule.target.updateYamlKey || rule.target.targetFileName || '')
              .onChange(async (value) => {
                rule.target.updateYamlKey = value.trim();
                await this.plugin.saveSettings();
              });
          });

        new Setting(section)
          .setName('属性值')
          .setDesc('支持模板变量: {{title}}, {{date}}, {{yaml:属性名}}')
          .addText((text) => {
            text.setPlaceholder('{{date}}')
              .setValue(rule.target.updateYamlValue || rule.target.destinationFolder || '')
              .onChange(async (value) => {
                rule.target.updateYamlValue = value;
                await this.plugin.saveSettings();
              });
          });
      } else if (rule.action === 'addTag') {
        new Setting(section)
          .setName('标签')
          .addText((text) => {
            text.setPlaceholder('已归档')
              .setValue(rule.target.tagValue || rule.target.targetFileName || '')
              .onChange(async (value) => {
                rule.target.tagValue = value.trim();
                await this.plugin.saveSettings();
              });
          });
      } else {
        new Setting(section)
          .setName('文件名模板')
          .setDesc('可用变量: {{title}}, {{date}}, {{time}}, {{ext}}, {{yaml:属性名}}')
          .addText((text) => {
            text.setPlaceholder('{{title}}-{{date}}')
              .setValue(rule.target.targetFileName || '')
              .onChange(async (value) => {
                rule.target.targetFileName = value;
                await this.plugin.saveSettings();
              });
          });
      }
    }
  }

  private renderSourceFilterSection(container: HTMLElement, rule: Rule): void {
    const section = container.createDiv('auto-plus-section');

    const title = section.createEl('h4', { text: '📍 源文件夹过滤', cls: 'auto-plus-section-title' });
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '14px';
    title.style.color = 'var(--text-accent)';

    const mode = rule.sourceFilter?.mode || 'all';

    new Setting(section)
      .setName('范围')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('all', '处理所有文件夹')
          .addOption('include', '仅以下文件夹')
          .addOption('exclude', '排除以下文件夹')
          .setValue(mode)
          .onChange(async (value: string) => {
            if (!rule.sourceFilter) {
              rule.sourceFilter = { mode: value as SourceFolderMode, folders: [] };
            } else {
              rule.sourceFilter.mode = value as SourceFolderMode;
            }
            await this.plugin.saveSettings();
          });
      });

    if (mode !== 'all') {
      if (!rule.sourceFilter) {
        rule.sourceFilter = { mode: mode as SourceFolderMode, folders: [] };
      }

      new Setting(section)
        .setName('包含子文件夹')
        .addToggle((toggle) => {
          toggle.setValue(rule.sourceFilter?.includeChildren || false).onChange(async (value) => {
            rule.sourceFilter!.includeChildren = value;
            await this.plugin.saveSettings();
          });
        });

      new Setting(section)
        .setName('使用正则匹配')
        .addToggle((toggle) => {
          toggle.setValue(rule.sourceFilter?.useRegex || false).onChange(async (value) => {
            rule.sourceFilter!.useRegex = value;
            await this.plugin.saveSettings();
          });
        });

      (rule.sourceFilter.folders || []).forEach((folder, index) => {
        const folderSetting = new Setting(section)
          .addSearch((cb) => {
            new FolderSuggest(this.plugin.app, cb.inputEl);
            cb.setPlaceholder('文件夹路径')
              .setValue(folder)
              .onChange(async (value) => {
                rule.sourceFilter!.folders![index] = value;
                await this.plugin.saveSettings();
              });
          })
          .addExtraButton((cb) => {
            cb.setIcon('cross')
              .setTooltip('删除')
              .onClick(async () => {
                rule.sourceFilter!.folders!.splice(index, 1);
                await this.plugin.saveSettings();
                this.display();
              });
          });
        folderSetting.infoEl.remove();
      });

      new Setting(section)
        .addButton((btn) => {
          btn.setButtonText('+ 添加文件夹').setCta().onClick(async () => {
            rule.sourceFilter!.folders = rule.sourceFilter!.folders || [];
            rule.sourceFilter!.folders.push('');
            await this.plugin.saveSettings();
            this.display();
          });
        });
    }
  }

  private addExcludedFoldersSettings(): void {
    const details = this.containerEl.createEl('details', { cls: 'auto-plus-excluded-settings' });
    details.style.marginTop = '20px';

    const summary = details.createEl('summary', { text: '🚫 全局排除文件夹' });
    summary.style.cursor = 'pointer';
    summary.style.fontWeight = '600';
    summary.style.padding = '8px 0';

    new Setting(details)
      .setName('使用正则匹配')
      .setDesc('启用后，排除规则将使用正则表达式匹配路径')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.globalExclude.useRegex || false).onChange(async (value) => {
          this.plugin.settings.globalExclude.useRegex = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(details)
      .addButton((button) => {
        button.setButtonText('+ 添加排除文件夹').setCta().onClick(async () => {
          this.plugin.settings.globalExclude.folders.push('');
          await this.plugin.saveSettings();
          this.display();
        });
      });

    this.plugin.settings.globalExclude.folders.forEach((folder, index) => {
      const setting = new Setting(details)
        .addSearch((cb) => {
          new FolderSuggest(this.plugin.app, cb.inputEl);
          cb.setPlaceholder('文件夹路径')
            .setValue(folder)
            .onChange(async (value) => {
              this.plugin.settings.globalExclude.folders[index] = value;
              await this.plugin.saveSettings();
            });
        })
        .addExtraButton((cb) => {
          cb.setIcon('cross')
            .setTooltip('删除')
            .onClick(async () => {
              this.plugin.settings.globalExclude.folders.splice(index, 1);
              await this.plugin.saveSettings();
              this.display();
            });
        });
      setting.infoEl.remove();
    });
  }

  private getConditionSummary(rule: Rule): string {
    if (rule.conditions.length === 0) return '无条件';
    return `${rule.conditions.length} 个条件 (${rule.logicOperator})`;
  }

  private getActionSummary(rule: Rule): string {
    const actionMap: Record<string, string> = {
      move: '移动',
      copy: '复制',
      moveRename: '移动+重命名',
      copyRename: '复制+重命名',
      rename: '重命名',
      delete: '删除',
      updateYaml: '更新属性',
      addTag: '添加标签',
    };
    return actionMap[rule.action] || rule.action;
  }

  private createDefaultRule(): Rule {
    return {
      id: '',
      name: '',
      enabled: true,
      priority: this.plugin.settings.rules.length,
      conditions: [],
      logicOperator: 'AND',
      action: 'move',
      target: {},
      sourceFilter: { mode: 'all', folders: [] },
      excludeFolders: [],
    };
  }

  private createDefaultCondition(): Condition {
    return {
      type: 'tag',
      tag: '',
    };
  }

  private generateId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private updateTriggerIndicator(): void {
    this.plugin.updateStatusBar?.();
  }

  private async testSingleRule(rule: Rule): Promise<void> {
    new Notice('正在测试规则...');
    const allFiles = this.plugin.getFileService()?.getAllMarkdownFiles() || [];
    let matchCount = 0;

    for (const file of allFiles) {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      const results = this.plugin.ruleEngine?.evaluateFile(file, cache) || [];
      if (results.some((r: any) => r.matched && r.rule.id === rule.id)) {
        matchCount++;
      }
    }

    new Notice(`规则 "${rule.name}" 匹配了 ${matchCount} 个文件`);
  }

  private async testRules(): Promise<void> {
    new Notice('正在测试所有规则...');
    const allFiles = this.plugin.getFileService()?.getAllMarkdownFiles() || [];
    let totalMatches = 0;

    for (const file of allFiles) {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      const results = this.plugin.ruleEngine?.evaluateFile(file, cache) || [];
      if (results.some((r: any) => r.matched)) {
        totalMatches++;
      }
    }

    new Notice(`规则测试完成，共匹配 ${totalMatches} 个文件`);
  }

  private async importRules(): Promise<void> {
    try {
      const clipboardText = await navigator.clipboard.readText();
      const importedRules = JSON.parse(clipboardText);

      if (!Array.isArray(importedRules)) {
        new Notice('导入失败：剪贴板内容不是有效的规则数组');
        return;
      }

      const validRules = importedRules.filter((r: any) => r.name && r.action);
      if (validRules.length === 0) {
        new Notice('导入失败：未找到有效的规则');
        return;
      }

      for (const rule of validRules) {
        rule.id = this.generateId();
      }

      this.plugin.settings.rules.push(...validRules);
      await this.plugin.saveSettings();
      new Notice(`成功导入 ${validRules.length} 条规则`);
      this.display();
    } catch (error) {
      new Notice(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  private async exportRules(): Promise<void> {
    const data = JSON.stringify(this.plugin.settings.rules, null, 2);
    await navigator.clipboard.writeText(data);
    new Notice('规则已复制到剪贴板');
  }
}
