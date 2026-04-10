export interface QuickActionsProps {
  onAddRule: () => void;
  onImportRules: () => void;
  onExportRules: () => void;
  onTestRules: () => void;
}

export class QuickActionsComponent {
  private element: HTMLElement;
  private props: QuickActionsProps;

  constructor(container: HTMLElement, props: QuickActionsProps) {
    this.props = props;
    this.element = this.render(container);
  }

  private render(container: HTMLElement): HTMLElement {
    const section = container.createDiv();
    section.addClass('auto-plus-quick-actions');

    const addBtn = this.createButton(section, '+ 新建规则', true);
    addBtn.onclick = () => this.props.onAddRule();

    const importBtn = this.createButton(section, '导入');
    importBtn.onclick = () => this.props.onImportRules();

    const exportBtn = this.createButton(section, '导出');
    exportBtn.onclick = () => this.props.onExportRules();

    const testBtn = this.createButton(section, '测试全部');
    testBtn.onclick = () => this.props.onTestRules();

    return section;
  }

  private createButton(container: HTMLElement, text: string, isPrimary: boolean = false): HTMLButtonElement {
    const btn = container.createEl('button');
    btn.textContent = text;
    if (isPrimary) {
      btn.addClass('mod-cta');
    }
    return btn;
  }

  destroy(): void {
    this.element.remove();
  }
}