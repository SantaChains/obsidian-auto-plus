import { App, Setting } from 'obsidian';
import { Condition, ConditionType, KeyMatchMode, YamlOperator, YamlArrayMatchMode } from '../../core/types';
import AutoNoteMover from '../../main';
import { MultiValueInput } from '../../components/MultiValueInput';
import { PathPatternEditor } from '../../components/MultiValueInput';

export interface RenderContext {
  app: App;
  plugin: AutoNoteMover;
  onSave: () => Promise<void>;
}

export interface ConditionRenderer {
  type: ConditionType;
  render(
    container: HTMLElement,
    condition: Condition,
    context: RenderContext
  ): void;
}

const conditionColors: Record<ConditionType, string> = {
  tag: '#7c3aed',
  title: '#2563eb',
  yaml: '#059669',
  mtime: '#d97706',
  path: '#dc2626',
  content: '#8b5cf6',
};

export class TagConditionRenderer implements ConditionRenderer {
  type: ConditionType = 'tag';

  render(container: HTMLElement, condition: Condition, context: RenderContext): void {
    const tagContainer = container.createDiv('multi-value-input-wrapper');
    new Setting(container).setName('标签').setDesc('选择或输入标签，支持多个');

    new MultiValueInput(
      context.app,
      tagContainer,
      condition.tag ? [condition.tag] : [],
      async (tags) => {
        condition.tag = tags[0] || '';
        await context.onSave();
      },
      {
        suggestType: 'tag',
        placeholder: '输入标签或选择...',
        emptyText: '暂无标签，输入添加',
        maxItems: 1,
      }
    );
  }
}

export class TitleConditionRenderer implements ConditionRenderer {
  type: ConditionType = 'title';

  render(container: HTMLElement, condition: Condition, context: RenderContext): void {
    new Setting(container)
      .setName('标题正则')
      .setDesc('使用 JavaScript 正则表达式匹配文件名')
      .addText((text) => {
        text.setPlaceholder('^\\d{4}-')
          .setValue(condition.pattern || '')
          .onChange(async (value) => {
            condition.pattern = value;
            await context.onSave();
          });
      });
  }
}

export class YamlConditionRenderer implements ConditionRenderer {
  type: ConditionType = 'yaml';

  render(container: HTMLElement, condition: Condition, context: RenderContext): void {
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
          .onChange(async (value) => {
            if (!yaml.keyCondition) {
              yaml.keyCondition = { matchMode: value as KeyMatchMode, pattern: '' };
            } else {
              yaml.keyCondition.matchMode = value as KeyMatchMode;
            }
            await context.onSave();
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
              await context.onSave();
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
              await context.onSave();
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
          .onChange(async (value) => {
            yaml.operator = value as YamlOperator;
            await context.onSave();
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
              await context.onSave();
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
            .onChange(async (value) => {
              yaml.arrayMatchMode = value as YamlArrayMatchMode;
              await context.onSave();
            });
        });
    }
  }
}

export class MtimeConditionRenderer implements ConditionRenderer {
  type: ConditionType = 'mtime';

  render(container: HTMLElement, condition: Condition, context: RenderContext): void {
    new Setting(container)
      .setName('时间条件')
      .setDesc('<30d: 30 天内，>7d: 7 天前，=1h: 1 小时内。单位：m=分钟，h=小时，d=天，w=周，M=月')
      .addText((text) => {
        text.setPlaceholder('<30d')
          .setValue(condition.mtimePattern || '')
          .onChange(async (value) => {
            condition.mtimePattern = value;
            await context.onSave();
          });
      });
  }
}

export class PathConditionRenderer implements ConditionRenderer {
  type: ConditionType = 'path';

  render(container: HTMLElement, condition: Condition, context: RenderContext): void {
    const pathContainer = container.createDiv('path-pattern-editor-wrapper');
    new Setting(container).setName('路径模式').setDesc('匹配文件完整路径');

    new PathPatternEditor(
      context.app,
      pathContainer,
      condition.pathPattern || '',
      async (pattern) => {
        condition.pathPattern = pattern;
        await context.onSave();
      },
      {
        placeholder: '输入路径模式，如：^content/drafts/',
        showPreview: true,
      }
    );
  }
}

export const conditionRenderers: ConditionRenderer[] = [
  new TagConditionRenderer(),
  new TitleConditionRenderer(),
  new YamlConditionRenderer(),
  new MtimeConditionRenderer(),
  new PathConditionRenderer(),
];

export function getConditionRenderer(type: ConditionType): ConditionRenderer | null {
  return conditionRenderers.find(r => r.type === type) || null;
}

export function getConditionColor(type: ConditionType): string {
  return conditionColors[type] || 'var(--background-modifier-border)';
}
