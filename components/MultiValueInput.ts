// ***************************************************************************************
// * 多值输入组件 - 人性化设计
// * 支持标签式多选、文件夹多选、路径模式可视化
// ***************************************************************************************

import { App, Setting } from 'obsidian';
import { FolderSuggest, TagSuggest } from '../suggests/suggest';

export interface MultiValueInputOptions {
  placeholder?: string;
  suggestType?: 'folder' | 'tag' | 'text';
  allowManualInput?: boolean;
  maxItems?: number;
  emptyText?: string;
}

export class MultiValueInput {
  private app: App;
  private container: HTMLElement;
  private values: string[];
  private onChange: (values: string[]) => void;
  private options: MultiValueInputOptions;

  private inputEl!: HTMLInputElement;
  private tagsContainer!: HTMLElement;
  private suggest: FolderSuggest | TagSuggest | null = null;

  constructor(
    app: App,
    container: HTMLElement,
    initialValues: string[],
    onChange: (values: string[]) => void,
    options: MultiValueInputOptions = {}
  ) {
    this.app = app;
    this.container = container;
    this.values = [...initialValues];
    this.onChange = onChange;
    this.options = {
      placeholder: '输入并选择...',
      suggestType: 'text',
      allowManualInput: true,
      maxItems: Infinity,
      emptyText: '暂无项目，输入添加',
      ...options
    };

    this.render();
  }

  private render(): void {
    this.container.empty();
    this.container.addClass('multi-value-input-container');

    // 标签展示区域
    this.tagsContainer = this.container.createDiv('multi-value-tags');
    this.renderTags();

    // 空状态提示
    if (this.values.length === 0 && this.options.emptyText) {
      const emptyHint = this.tagsContainer.createDiv('multi-value-empty-hint');
      emptyHint.setText(this.options.emptyText);
    }

    // 输入区域
    const inputWrapper = this.container.createDiv('multi-value-input-wrapper');

    this.inputEl = inputWrapper.createEl('input', {
      type: 'text',
      placeholder: this.options.placeholder,
      cls: 'multi-value-input'
    });

    // 根据类型初始化建议组件
    if (this.options.suggestType === 'folder') {
      this.suggest = new FolderSuggest(this.app, this.inputEl);
      this.suggest.selectSuggestion = (item, evt) => {
        this.addValue(item.path);
        this.inputEl.value = '';
      };
    } else if (this.options.suggestType === 'tag') {
      this.suggest = new TagSuggest(this.app, this.inputEl);
      this.suggest.selectSuggestion = (item, evt) => {
        this.addValue(item.name);
        this.inputEl.value = '';
      };
    }

    // 手动输入支持
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.options.allowManualInput) {
        const value = this.inputEl.value.trim();
        if (value && !this.values.includes(value)) {
          this.addValue(value);
          this.inputEl.value = '';
        }
        e.preventDefault();
      }
    });

    // 添加按钮（可选）
    if (this.options.allowManualInput) {
      const addBtn = inputWrapper.createEl('button', {
        cls: 'multi-value-add-btn',
        attr: { 'aria-label': '添加' }
      });
      addBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
      addBtn.addEventListener('click', () => {
        const value = this.inputEl.value.trim();
        if (value && !this.values.includes(value)) {
          this.addValue(value);
          this.inputEl.value = '';
        }
      });
    }
  }

  private renderTags(): void {
    this.tagsContainer.empty();

    for (const value of this.values) {
      const tag = this.tagsContainer.createDiv('multi-value-tag');

      // 根据类型显示不同图标
      const icon = tag.createSpan('multi-value-tag-icon');
      if (this.options.suggestType === 'folder') {
        icon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
      } else if (this.options.suggestType === 'tag') {
        icon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`;
      }

      const text = tag.createSpan('multi-value-tag-text');
      text.setText(value);

      const removeBtn = tag.createEl('button', {
        cls: 'multi-value-tag-remove',
        attr: { 'aria-label': '移除' }
      });
      removeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      removeBtn.addEventListener('click', () => {
        this.removeValue(value);
      });
    }
  }

  private addValue(value: string): void {
    if (this.values.length >= this.options.maxItems!) {
      return;
    }
    if (this.values.includes(value)) {
      return;
    }
    this.values.push(value);
    this.renderTags();
    this.onChange([...this.values]);
  }

  private removeValue(value: string): void {
    this.values = this.values.filter(v => v !== value);
    this.renderTags();
    this.onChange([...this.values]);

    // 如果为空，显示空状态
    if (this.values.length === 0 && this.options.emptyText) {
      const emptyHint = this.tagsContainer.createDiv('multi-value-empty-hint');
      emptyHint.setText(this.options.emptyText);
    }
  }

  getValues(): string[] {
    return [...this.values];
  }

  setValues(values: string[]): void {
    this.values = [...values];
    this.renderTags();
  }

  destroy(): void {
    if (this.suggest) {
      // suggest 组件会在 inputEl 移除时自动清理
    }
    this.container.empty();
  }
}

// ***************************************************************************************
// * 路径模式编辑器 - 可视化路径构建
// ***************************************************************************************

export interface PathPatternEditorOptions {
  placeholder?: string;
  showPreview?: boolean;
}

export class PathPatternEditor {
  private app: App;
  private container: HTMLElement;
  private value: string;
  private onChange: (value: string) => void;
  private options: PathPatternEditorOptions;

  private inputEl!: HTMLInputElement;
  private previewEl: HTMLElement | null = null;
  private builderEl: HTMLElement | null = null;

  constructor(
    app: App,
    container: HTMLElement,
    initialValue: string,
    onChange: (value: string) => void,
    options: PathPatternEditorOptions = {}
  ) {
    this.app = app;
    this.container = container;
    this.value = initialValue || '';
    this.onChange = onChange;
    this.options = {
      placeholder: '输入路径模式，如: ^content/drafts/',
      showPreview: true,
      ...options
    };

    this.render();
  }

  private render(): void {
    this.container.empty();
    this.container.addClass('path-pattern-editor');

    // 输入框
    const inputWrapper = this.container.createDiv('path-pattern-input-wrapper');

    this.inputEl = inputWrapper.createEl('input', {
      type: 'text',
      placeholder: this.options.placeholder,
      cls: 'path-pattern-input'
    });
    this.inputEl.value = this.value;

    // 快速插入按钮
    const quickActions = inputWrapper.createDiv('path-pattern-quick-actions');

    const patterns = [
      { label: '任意字符', value: '.*', desc: '匹配任意内容' },
      { label: '文件夹', value: '[^/]+/', desc: '匹配一级目录' },
      { label: '开头', value: '^', desc: '匹配开头' },
      { label: '结尾', value: '$', desc: '匹配结尾' },
    ];

    for (const pattern of patterns) {
      const btn = quickActions.createEl('button', {
        cls: 'path-pattern-btn',
        attr: { title: pattern.desc }
      });
      btn.setText(pattern.label);
      btn.addEventListener('click', () => {
        this.insertAtCursor(pattern.value);
      });
    }

    // 文件夹选择器
    const folderSuggest = new FolderSuggest(this.app, this.inputEl);
    folderSuggest.selectSuggestion = (item, evt) => {
      // 将路径转换为正则友好的格式
      const escapedPath = item.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      this.insertAtCursor(escapedPath);
    };

    // 输入监听
    this.inputEl.addEventListener('input', () => {
      this.value = this.inputEl.value;
      this.onChange(this.value);
      this.updatePreview();
    });

    // 预览区域
    if (this.options.showPreview) {
      this.previewEl = this.container.createDiv('path-pattern-preview');
      this.previewEl.createDiv('path-pattern-preview-title').setText('匹配预览');
      this.updatePreview();
    }
  }

  private insertAtCursor(text: string): void {
    const start = this.inputEl.selectionStart || 0;
    const end = this.inputEl.selectionEnd || 0;
    const currentValue = this.inputEl.value;

    this.inputEl.value = currentValue.substring(0, start) + text + currentValue.substring(end);
    this.inputEl.selectionStart = this.inputEl.selectionEnd = start + text.length;
    this.inputEl.focus();

    this.value = this.inputEl.value;
    this.onChange(this.value);
    this.updatePreview();
  }

  private updatePreview(): void {
    if (!this.previewEl) return;

    const previewContent = this.previewEl.querySelector('.path-pattern-preview-content');
    if (previewContent) previewContent.remove();

    const content = this.previewEl.createDiv('path-pattern-preview-content');

    if (!this.value) {
      content.createDiv('path-pattern-preview-empty').setText('输入模式查看匹配的文件');
      return;
    }

    try {
      const regex = new RegExp(this.value);
      const files = this.app.vault.getMarkdownFiles();
      const matches: string[] = [];

      for (const file of files) {
        if (regex.test(file.path)) {
          matches.push(file.path);
          if (matches.length >= 5) break;
        }
      }

      if (matches.length === 0) {
        content.createDiv('path-pattern-preview-empty').setText('没有匹配的文件');
      } else {
        const list = content.createDiv('path-pattern-preview-list');
        for (const match of matches) {
          const item = list.createDiv('path-pattern-preview-item');
          item.setText(match);
        }
        if (matches.length >= 5) {
          content.createDiv('path-pattern-preview-more').setText('... 更多匹配');
        }
      }
    } catch (e) {
      content.createDiv('path-pattern-preview-error').setText('正则表达式无效');
    }
  }

  getValue(): string {
    return this.value;
  }

  setValue(value: string): void {
    this.value = value;
    this.inputEl.value = value;
    this.updatePreview();
  }

  destroy(): void {
    this.container.empty();
  }
}
