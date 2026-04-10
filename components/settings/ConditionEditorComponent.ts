import { Setting } from 'obsidian';
import { Rule, Condition } from '../../core/types';
import { getConditionColor } from '../../utils/settings/conditionRenderers';

export interface ConditionEditorProps {
  rule: Rule;
  onSave?: () => Promise<void>;
}

export class ConditionEditorComponent {
  private element: HTMLElement;
  private props: ConditionEditorProps;

  constructor(container: HTMLElement, props: ConditionEditorProps) {
    this.props = props;
    this.element = this.render(container);
  }

  private render(container: HTMLElement): HTMLElement {
    const section = container.createDiv('auto-plus-section');
    section.addClass('auto-plus-condition-list');

    const title = section.createEl('h4', { text: '条件', cls: 'auto-plus-section-title' });
    title.style.color = 'var(--text-accent)';

    this.addLogicOperatorSetting(section);
    this.renderConditions(section);
    this.addAddConditionButton(section);

    return section;
  }

  private addLogicOperatorSetting(container: HTMLElement): void {
    const { rule } = this.props;
    new Setting(container)
      .setName('逻辑关系')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('AND', '全部满足 (AND)')
          .addOption('OR', '任一满足 (OR)')
          .setValue(rule.logicOperator)
          .onChange(async (value: string) => {
            rule.logicOperator = value as 'AND' | 'OR';
            await this.props.onSave?.();
          });
      });
  }

  private renderConditions(container: HTMLElement): void {
    const { rule } = this.props;

    if (rule.conditions.length === 0) {
      return;
    }

    rule.conditions.forEach((condition, index) => {
      this.renderConditionItem(container, condition, index);
    });
  }

  private renderConditionItem(container: HTMLElement, condition: Condition, index: number): void {
    const { rule } = this.props;
    const item = container.createDiv('auto-plus-condition-item');
    item.style.borderColor = getConditionColor(condition.type);

    const header = item.createDiv('auto-plus-condition-header');

    const typeLabel = header.createEl('span', {
      text: `条件 ${index + 1}`,
      cls: 'setting-item-name'
    });
    typeLabel.style.color = getConditionColor(condition.type);

    const deleteBtn = header.createEl('button', { text: '删除', cls: 'mod-warning' });
    deleteBtn.style.fontSize = '11px';
    deleteBtn.onclick = async () => {
      rule.conditions.splice(index, 1);
      await this.props.onSave?.();
      this.refresh();
    };

    this.renderConditionFields(item, condition);
  }

  private renderConditionFields(container: HTMLElement, condition: Condition): void {
    const { rule } = this.props;

    new Setting(container)
      .setName('类型')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('tag', '标签')
          .addOption('title', '标题正则')
          .addOption('yaml', 'YAML 属性')
          .addOption('mtime', '修改时间')
          .addOption('path', '文件路径')
          .setValue(condition.type)
          .onChange(async (value: string) => {
            condition.type = value as Condition['type'];
            if (condition.type === 'yaml' && !condition.yaml) {
              condition.yaml = { key: '', operator: 'exists' };
            }
            await this.props.onSave?.();
            this.refresh();
          });
      });

    if (condition.type === 'tag' || condition.type === 'title') {
      this.addPatternSetting(container, condition);
    } else if (condition.type === 'yaml') {
      this.addYamlKeySetting(container, condition);
      this.addYamlOperatorSetting(container, condition);
      if (condition.yaml?.operator && !['exists', 'notExists'].includes(condition.yaml.operator)) {
        this.addYamlValueSetting(container, condition);
      }
    } else if (condition.type === 'mtime') {
      this.addMtimeSetting(container, condition);
    }
  }

  private addPatternSetting(container: HTMLElement, condition: Condition): void {
    new Setting(container)
      .setName('匹配内容')
      .setDesc('支持正则表达式')
      .addText((text) => {
        text.setPlaceholder(condition.type === 'tag' ? '#标签名' : '正则表达式')
          .setValue(condition.pattern || '')
          .onChange(async (value) => {
            condition.pattern = value;
            await this.props.onSave?.();
          });
      });
  }

  private addYamlKeySetting(container: HTMLElement, condition: Condition): void {
    new Setting(container)
      .setName('YAML 键名')
      .addText((text) => {
        text.setPlaceholder('属性名')
          .setValue(condition.yaml?.key || '')
          .onChange(async (value) => {
            if (!condition.yaml) {
              condition.yaml = { key: '', operator: 'exists' };
            }
            condition.yaml.key = value;
            await this.props.onSave?.();
          });
      });
  }

  private addYamlOperatorSetting(container: HTMLElement, condition: Condition): void {
    const currentOp = condition.yaml?.operator || 'exists';
    new Setting(container)
      .setName('操作符')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('exists', '存在')
          .addOption('notExists', '不存在')
          .addOption('equals', '等于')
          .addOption('notEquals', '不等于')
          .addOption('contains', '包含')
          .addOption('startsWith', '开头是')
          .addOption('endsWith', '结尾是')
          .addOption('matches', '正则匹配')
          .addOption('gt', '大于')
          .addOption('lt', '小于')
          .setValue(currentOp)
          .onChange(async (value) => {
            if (!condition.yaml) {
              condition.yaml = { key: '', operator: 'exists' };
            }
            condition.yaml.operator = value as import('../../core/types').YamlOperator;
            await this.props.onSave?.();
            this.refresh();
          });
      });
  }

  private addYamlValueSetting(container: HTMLElement, condition: Condition): void {
    const yamlValue = condition.yaml?.value;
    const stringValue = typeof yamlValue === 'string' ? yamlValue : '';
    new Setting(container)
      .setName('比较值')
      .addText((text) => {
        text.setPlaceholder('比较值')
          .setValue(stringValue)
          .onChange(async (value) => {
            if (!condition.yaml) {
              condition.yaml = { key: '', operator: 'exists' };
            }
            condition.yaml.value = value;
            await this.props.onSave?.();
          });
      });
  }

  private addMtimeSetting(container: HTMLElement, condition: Condition): void {
    new Setting(container)
      .setName('时间条件')
      .setDesc('如：1d, 7d, 30d')
      .addText((text) => {
        text.setPlaceholder('如：1d, 7d, 30d')
          .setValue(condition.pattern || '')
          .onChange(async (value) => {
            condition.pattern = value;
            await this.props.onSave?.();
          });
      });
  }

  private addAddConditionButton(container: HTMLElement): void {
    const { rule } = this.props;
    new Setting(container)
      .addButton((btn) => {
        btn.setButtonText('+ 添加条件').setCta().onClick(async () => {
          rule.conditions.push({ type: 'tag', tag: '' });
          await this.props.onSave?.();
          this.refresh();
        });
      });
  }

  private refresh(): void {
    const parent = this.element.parentElement;
    if (parent) {
      this.destroy();
      parent.appendChild(this.render(parent));
    }
  }

  destroy(): void {
    this.element.remove();
  }
}