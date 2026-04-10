import { Setting } from 'obsidian';
import { Rule } from '../../core/types';
import { ConditionEditorComponent } from './ConditionEditorComponent';
import { ActionConfigComponent } from './ActionConfigComponent';
import { SourceFilterComponent } from './SourceFilterComponent';

export interface RuleEditorProps {
  rule: Rule;
  onSave?: () => Promise<void>;
}

export class RuleEditorComponent {
  private element: HTMLElement;
  private props: RuleEditorProps;
  private conditionEditor: ConditionEditorComponent | null = null;
  private actionConfig: ActionConfigComponent | null = null;
  private sourceFilter: SourceFilterComponent | null = null;

  constructor(container: HTMLElement, props: RuleEditorProps) {
    this.props = props;
    this.element = this.render(container);
  }

  private render(container: HTMLElement): HTMLElement {
    const { rule } = this.props;

    this.renderRuleName(container);
    this.renderTriggerMode(container);

    if (rule.triggerMode === 'scheduled') {
      this.renderScheduleSettings(container);
    }

    if (rule.triggerMode === 'manual') {
      this.renderManualModeHint(container);
    }

    this.conditionEditor = new ConditionEditorComponent(container, {
      rule,
      onSave: this.props.onSave,
    });

    this.actionConfig = new ActionConfigComponent(container, {
      rule,
      onSave: this.props.onSave,
    });

    this.sourceFilter = new SourceFilterComponent(container, {
      rule,
      onSave: this.props.onSave,
    });

    return container;
  }

  private renderRuleName(container: HTMLElement): void {
    const { rule } = this.props;
    new Setting(container)
      .setName('规则名称')
      .addText((text) => {
        text.setPlaceholder('输入规则名称')
          .setValue(rule.name)
          .onChange(async (value) => {
            rule.name = value;
            await this.props.onSave?.();
          });
      });
  }

  private renderTriggerMode(container: HTMLElement): void {
    const { rule } = this.props;
    new Setting(container)
      .setName('触发模式')
      .setDesc('自动：文件变更时自动执行 | 手动：通过命令面板执行 | 定时：按计划执行')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('auto', '自动')
          .addOption('manual', '手动')
          .addOption('scheduled', '定时')
          .setValue(rule.triggerMode || 'auto')
          .onChange(async (value: string) => {
            rule.triggerMode = value as 'auto' | 'manual' | 'scheduled';
            await this.props.onSave?.();
            this.refresh();
          });
      });
  }

  private renderScheduleSettings(container: HTMLElement): void {
    const { rule } = this.props;
    const scheduleSection = container.createDiv('schedule-settings');

    if (!rule.schedule) {
      rule.schedule = {};
    }

    new Setting(scheduleSection)
      .setName('定时类型')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('interval', '固定间隔')
          .addOption('cron', 'Cron 表达式')
          .setValue(rule.schedule?.cron ? 'cron' : 'interval')
          .onChange(async (value) => {
            if (value === 'interval') {
              rule.schedule!.cron = undefined;
            } else {
              rule.schedule!.interval = undefined;
            }
            await this.props.onSave?.();
            this.refresh();
          });
      });

    if (!rule.schedule.cron) {
      new Setting(scheduleSection)
        .setName('间隔（分钟）')
        .addText((text) => {
          text.setPlaceholder('60')
            .setValue(String(rule.schedule?.interval || ''))
            .onChange(async (value) => {
              const num = parseInt(value);
              rule.schedule!.interval = isNaN(num) ? undefined : num;
              await this.props.onSave?.();
            });
        });
    } else {
      new Setting(scheduleSection)
        .setName('Cron 表达式')
        .setDesc('格式：分 时 日 月 周，如 "0 9 * * 1" 表示每周一 9 点')
        .addText((text) => {
          text.setPlaceholder('0 9 * * 1')
            .setValue(rule.schedule?.cron || '')
            .onChange(async (value) => {
              rule.schedule!.cron = value || undefined;
              await this.props.onSave?.();
            });
        });
    }
  }

  private renderManualModeHint(container: HTMLElement): void {
    const { rule } = this.props;
    const manualHint = container.createDiv('manual-mode-hint');
    manualHint.innerHTML = `此规则已注册到 Obsidian 命令面板，可通过 <kbd>Ctrl+P</kbd> 搜索 "执行规则：${rule.name}" 来触发`;
  }

  private refresh(): void {
    const parent = this.element.parentElement;
    if (parent) {
      this.destroy();
      parent.appendChild(this.render(parent));
    }
  }

  destroy(): void {
    if (this.conditionEditor) {
      this.conditionEditor.destroy();
    }
    if (this.actionConfig) {
      this.actionConfig.destroy();
    }
    if (this.sourceFilter) {
      this.sourceFilter.destroy();
    }
  }
}
