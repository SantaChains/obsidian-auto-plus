import { Setting } from 'obsidian';
import { Rule } from '../../core/types';
import { getConditionSummary, getActionSummary, statusColors } from '../../utils/settings/uiHelpers';
import { RuleEditorComponent } from './RuleEditorComponent';

export interface RuleCardProps {
  rule: Rule;
  isExpanded: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggleExpand: (ruleId: string) => void;
  onToggleEnabled: (ruleId: string, enabled: boolean) => void;
  onMoveUp: (ruleId: string) => void;
  onMoveDown: (ruleId: string) => void;
  onDelete: (ruleId: string) => void;
  onTest: (rule: Rule) => void;
}

export class RuleCardComponent {
  private element: HTMLElement;
  private props: RuleCardProps;
  private ruleEditor: RuleEditorComponent | null = null;

  constructor(container: HTMLElement, props: RuleCardProps) {
    this.props = props;
    this.element = this.render(container);
  }

  private render(container: HTMLElement): HTMLElement {
    const { rule, isExpanded } = this.props;
    const isEnabled = rule.enabled !== false;

    const card = container.createDiv();
    card.addClass('auto-plus-rule-card');
    if (!isEnabled) {
      card.addClass('is-disabled');
    }

    const statusBar = card.createDiv();
    statusBar.addClass('auto-plus-rule-status-bar');
    statusBar.addClass(isEnabled ? 'is-enabled' : 'is-disabled');

    const header = this.renderHeader(card, rule, isExpanded, isEnabled);
    this.renderActions(header, rule);

    if (isExpanded) {
      const body = card.createDiv();
      body.addClass('auto-plus-rule-body');
      this.ruleEditor = new RuleEditorComponent(body, {
        rule,
        onSave: async () => {},
      });
    }

    return card;
  }

  private renderHeader(
    card: HTMLElement,
    rule: Rule,
    isExpanded: boolean,
    isEnabled: boolean
  ): HTMLElement {
    const header = card.createDiv();
    header.addClass('auto-plus-rule-header');
    if (isExpanded) {
      header.addClass('is-expanded');
    }

    const toggle = header.createEl('input');
    toggle.type = 'checkbox';
    toggle.checked = isEnabled;
    toggle.onchange = () => {
      this.props.onToggleEnabled(rule.id!, toggle.checked);
    };

    const summary = header.createDiv();
    summary.addClass('auto-plus-rule-summary');
    summary.onclick = () => {
      this.props.onToggleExpand(rule.id!);
    };

    const titleEl = summary.createDiv();
    titleEl.addClass('auto-plus-rule-title');
    if (!isEnabled) {
      titleEl.addClass('is-disabled');
    }
    titleEl.textContent = rule.name || '未命名规则';

    const conditionText = getConditionSummary(rule);
    const actionText = getActionSummary(rule);

    const descEl = summary.createDiv();
    descEl.addClass('auto-plus-rule-desc');
    descEl.textContent = `${conditionText} → ${actionText}`;

    return header;
  }

  private renderActions(header: HTMLElement, rule: Rule): void {
    const { canMoveUp, canMoveDown } = this.props;
    const actions = header.createDiv();
    actions.addClass('auto-plus-rule-actions');

    if (canMoveUp) {
      const upBtn = this.createIconButton(actions, 'up', '上移', () => {
        this.props.onMoveUp(rule.id!);
      });
      upBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
    }

    if (canMoveDown) {
      const downBtn = this.createIconButton(actions, 'down', '下移', () => {
        this.props.onMoveDown(rule.id!);
      });
      downBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    }

    const testBtn = this.createIconButton(actions, 'test', '测试规则', () => {
      this.props.onTest(rule);
    });
    testBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;

    const deleteBtn = this.createIconButton(actions, 'delete', '删除规则', () => {
      if (confirm(`确定要删除规则 "${rule.name}" 吗？`)) {
        this.props.onDelete(rule.id!);
      }
    }, true);
    deleteBtn.addClass('auto-plus-delete-btn');
    deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

    const expandIcon = header.createEl('span');
    expandIcon.addClass('auto-plus-expand-btn');
    expandIcon.innerHTML = this.props.isExpanded
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    expandIcon.onclick = () => {
      this.props.onToggleExpand(rule.id!);
    };
  }

  private createIconButton(
    container: HTMLElement,
    name: string,
    title: string,
    onClick: (e: MouseEvent) => void,
    isDanger: boolean = false
  ): HTMLButtonElement {
    const btn = container.createEl('button');
    btn.setAttribute('aria-label', title);
    btn.title = title;
    btn.onclick = (e: MouseEvent) => {
      e.stopPropagation();
      onClick(e);
    };
    return btn;
  }

  update(props: Partial<RuleCardProps>): void {
    this.props = { ...this.props, ...props };
    const parent = this.element.parentElement;
    if (parent) {
      this.element.replaceWith(this.render(parent));
    }
  }

  destroy(): void {
    if (this.ruleEditor) {
      this.ruleEditor.destroy();
    }
    this.element.remove();
  }
}