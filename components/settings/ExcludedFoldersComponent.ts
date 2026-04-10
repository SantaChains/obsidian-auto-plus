import { Setting } from 'obsidian';
import { ExcludeConfig } from '../../core/types';
import { MultiValueInput } from '../../components/MultiValueInput';

export interface ExcludedFoldersProps {
  globalExclude: ExcludeConfig;
  onChange: (exclude: ExcludeConfig) => Promise<void>;
}

export class ExcludedFoldersComponent {
  private element: HTMLElement;
  private props: ExcludedFoldersProps;

  constructor(container: HTMLElement, globalExclude: ExcludeConfig, onChange: (exclude: ExcludeConfig) => Promise<void>) {
    this.props = { globalExclude, onChange };
    this.element = this.render(container);
  }

  private render(container: HTMLElement): HTMLElement {
    const details = container.createEl('details', { cls: 'auto-plus-excluded-settings' });

    const summary = details.createEl('summary', { text: '全局排除文件夹' });

    this.addRegexToggle(details);
    this.addFoldersInput(details);

    return details;
  }

  private addRegexToggle(container: HTMLElement): void {
    const { globalExclude } = this.props;

    new Setting(container)
      .setName('使用正则匹配')
      .setDesc('启用后，排除规则将使用正则表达式匹配路径')
      .addToggle((toggle) => {
        toggle.setValue(globalExclude.useRegex ?? false).onChange(async (value) => {
          globalExclude.useRegex = value;
          await this.props.onChange(globalExclude);
        });
      });
  }

  private addFoldersInput(container: HTMLElement): void {
    const { globalExclude } = this.props;

    new Setting(container)
      .setName('排除文件夹列表')
      .setDesc('这些文件夹及其子文件夹将被排除在规则处理之外')
      .addTextArea((text) => {
        text.inputEl.rows = 4;
        text.setPlaceholder('每行一个文件夹路径')
          .setValue(globalExclude.folders.join('\n'))
          .onChange(async (value) => {
            globalExclude.folders = value.split('\n').map(f => f.trim()).filter(f => f);
            await this.props.onChange(globalExclude);
          });
      });
  }

  destroy(): void {
    this.element.remove();
  }
}