import { Setting } from 'obsidian';
import { Rule, ActionType } from '../../core/types';
import { actionColors } from '../../utils/settings/uiHelpers';
import { FolderSuggest } from '../../suggests/suggest';

export interface ActionConfigProps {
  rule: Rule;
  onSave?: () => Promise<void>;
}

export class ActionConfigComponent {
  private element: HTMLElement;
  private props: ActionConfigProps;

  constructor(container: HTMLElement, props: ActionConfigProps) {
    this.props = props;
    this.element = this.render(container);
  }

  private render(container: HTMLElement): HTMLElement {
    const section = container.createDiv('auto-plus-section');

    const title = section.createEl('h4', { text: '操作', cls: 'auto-plus-section-title' });
    title.style.color = actionColors[this.props.rule.action] || 'var(--text-accent)';

    this.addActionTypeDropdown(section);
    this.addTargetFolderSetting(section);
    this.addFileNameTemplateSetting(section);

    return section;
  }

  private addActionTypeDropdown(container: HTMLElement): void {
    const { rule } = this.props;
    new Setting(container)
      .setName('操作类型')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('move', '移动到文件夹')
          .addOption('copy', '复制到文件夹')
          .addOption('moveRename', '移动并重命名')
          .addOption('copyRename', '复制并重命名')
          .addOption('rename', '仅重命名')
          .addOption('delete', '删除文件')
          .addOption('updateYaml', '更新 YAML 属性')
          .addOption('addTag', '添加标签')
          .setValue(rule.action)
          .onChange(async (value: string) => {
            rule.action = value as ActionType;
            await this.props.onSave?.();
            this.refresh();
          });
      });
  }

  private addTargetFolderSetting(container: HTMLElement): void {
    const { rule } = this.props;
    const needsFolder = ['move', 'copy', 'moveRename', 'copyRename'].includes(rule.action);

    if (needsFolder) {
      new Setting(container)
        .setName('目标文件夹')
        .addSearch((cb) => {
          const app = (window as unknown as { app?: import('obsidian').App }).app;
          if (app) {
            new FolderSuggest(app, cb.inputEl);
          }
          cb.setPlaceholder('选择或输入文件夹路径')
            .setValue(rule.target.destinationFolder || '')
            .onChange(async (value) => {
              rule.target.destinationFolder = value.trim();
              await this.props.onSave?.();
            });
        });
    }
  }

  private addFileNameTemplateSetting(container: HTMLElement): void {
    const { rule } = this.props;
    const needsFileName = ['moveRename', 'copyRename', 'rename', 'updateYaml', 'addTag'].includes(rule.action);

    if (needsFileName) {
      if (rule.action === 'updateYaml') {
        this.addYamlUpdateSettings(container);
      } else if (rule.action === 'addTag') {
        this.addTagSetting(container);
      } else {
        this.addFileNameTemplate(container);
      }
    }
  }

  private addYamlUpdateSettings(container: HTMLElement): void {
    const { rule } = this.props;

    new Setting(container)
      .setName('属性名')
      .addText((text) => {
        text.setPlaceholder('updated')
          .setValue(rule.target.updateYamlKey || rule.target.targetFileName || '')
          .onChange(async (value) => {
            rule.target.updateYamlKey = value.trim();
            await this.props.onSave?.();
          });
      });

    new Setting(container)
      .setName('属性值')
      .setDesc('支持模板变量：{{title}}, {{date}}, {{yaml:属性名}}')
      .addText((text) => {
        text.setPlaceholder('{{date}}')
          .setValue(rule.target.updateYamlValue || rule.target.destinationFolder || '')
          .onChange(async (value) => {
            rule.target.updateYamlValue = value;
            await this.props.onSave?.();
          });
      });
  }

  private addTagSetting(container: HTMLElement): void {
    const { rule } = this.props;

    new Setting(container)
      .setName('标签')
      .addText((text) => {
        text.setPlaceholder('已归档')
          .setValue(rule.target.tagValue || rule.target.targetFileName || '')
          .onChange(async (value) => {
            rule.target.tagValue = value.trim();
            await this.props.onSave?.();
          });
      });
  }

  private addFileNameTemplate(container: HTMLElement): void {
    const { rule } = this.props;

    new Setting(container)
      .setName('文件名模板')
      .setDesc('可用变量：{{title}}, {{date}}, {{time}}, {{ext}}, {{yaml:属性名}}')
      .addText((text) => {
        text.setPlaceholder('{{title}}-{{date}}')
          .setValue(rule.target.targetFileName || '')
          .onChange(async (value) => {
            rule.target.targetFileName = value;
            await this.props.onSave?.();
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
