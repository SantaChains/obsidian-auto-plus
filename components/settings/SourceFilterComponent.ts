import { Setting } from 'obsidian';
import { Rule, SourceFolderMode } from '../../core/types';
import { MultiValueInput } from '../../components/MultiValueInput';

export interface SourceFilterProps {
  rule: Rule;
  onSave?: () => Promise<void>;
}

export class SourceFilterComponent {
  private element: HTMLElement;
  private props: SourceFilterProps;

  constructor(container: HTMLElement, props: SourceFilterProps) {
    this.props = props;
    this.element = this.render(container);
  }

  private render(container: HTMLElement): HTMLElement {
    const section = container.createDiv('auto-plus-section');

    const title = section.createEl('h4', { text: '源文件夹过滤', cls: 'auto-plus-section-title' });
    title.style.color = 'var(--text-accent)';

    this.addModeDropdown(section);
    this.addChildrenToggle(section);
    this.addRegexToggle(section);
    this.addFoldersInput(section);

    return section;
  }

  private addModeDropdown(container: HTMLElement): void {
    const { rule } = this.props;
    const mode = rule.sourceFilter?.mode || 'all';

    new Setting(container)
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
            await this.props.onSave?.();
            this.refresh();
          });
      });
  }

  private addChildrenToggle(container: HTMLElement): void {
    const { rule } = this.props;
    const mode = rule.sourceFilter?.mode || 'all';

    if (mode !== 'all') {
      new Setting(container)
        .setName('包含子文件夹')
        .addToggle((toggle) => {
          toggle.setValue(rule.sourceFilter?.includeChildren || false).onChange(async (value) => {
            if (!rule.sourceFilter) {
              rule.sourceFilter = { mode: mode as SourceFolderMode, folders: [], includeChildren: value };
            } else {
              rule.sourceFilter.includeChildren = value;
            }
            await this.props.onSave?.();
          });
        });
    }
  }

  private addRegexToggle(container: HTMLElement): void {
    const { rule } = this.props;
    const mode = rule.sourceFilter?.mode || 'all';

    if (mode !== 'all') {
      new Setting(container)
        .setName('使用正则匹配')
        .addToggle((toggle) => {
          toggle.setValue(rule.sourceFilter?.useRegex || false).onChange(async (value) => {
            if (!rule.sourceFilter) {
              rule.sourceFilter = { mode: mode as SourceFolderMode, folders: [], useRegex: value };
            } else {
              rule.sourceFilter.useRegex = value;
            }
            await this.props.onSave?.();
          });
        });
    }
  }

  private addFoldersInput(container: HTMLElement): void {
    const { rule } = this.props;
    const mode = rule.sourceFilter?.mode || 'all';

    if (mode !== 'all') {
      if (!rule.sourceFilter) {
        rule.sourceFilter = { mode: mode as SourceFolderMode, folders: [] };
      }

      const foldersContainer = container.createDiv('multi-value-input-wrapper');
      new Setting(container).setName('文件夹列表').setDesc('选择或输入文件夹路径');

      const app = (this as any).app || (window as any).app;
      new MultiValueInput(
        app,
        foldersContainer,
        rule.sourceFilter.folders || [],
        async (folders) => {
          rule.sourceFilter!.folders = folders;
          await this.props.onSave?.();
        },
        {
          suggestType: 'folder',
          placeholder: '输入文件夹路径或选择...',
          emptyText: '暂无文件夹，输入添加',
        }
      );
    }
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
