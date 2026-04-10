import { Rule, ActionType } from '../../core/types';

export const statusColors = {
  enabled: '#22c55e',
  disabled: '#94a3b8',
  matched: '#3b82f6',
  error: '#ef4444',
};

export const actionColors: Record<ActionType, string> = {
  move: '#3b82f6',
  copy: '#8b5cf6',
  moveRename: '#6366f1',
  copyRename: '#a855f7',
  rename: '#f59e0b',
  delete: '#ef4444',
  updateYaml: '#10b981',
  addTag: '#ec4899',
};

export function getConditionSummary(rule: Rule): string {
  if (rule.conditions.length === 0) return '无条件';
  return `${rule.conditions.length} 个条件 (${rule.logicOperator})`;
}

export function getActionSummary(rule: Rule): string {
  const actionMap: Record<ActionType, string> = {
    move: '移动',
    copy: '复制',
    moveRename: '移动 + 重命名',
    copyRename: '复制 + 重命名',
    rename: '重命名',
    delete: '删除',
    updateYaml: '更新属性',
    addTag: '添加标签',
  };
  return actionMap[rule.action] || rule.action;
}

export function applyCardStyles(card: HTMLElement, isEnabled: boolean): void {
  card.style.border = `1px solid ${isEnabled ? 'var(--background-modifier-border)' : statusColors.disabled}`;
  card.style.borderRadius = '8px';
  card.style.marginBottom = '12px';
  card.style.background = isEnabled ? 'var(--background-primary)' : 'var(--background-secondary)';
  card.style.opacity = isEnabled ? '1' : '0.7';
}

export function createQuickAction(container: HTMLElement, text: string, onClick: () => void, isCta: boolean = false): HTMLButtonElement {
  const btn = container.createEl('button', { text });
  btn.style.padding = '8px 16px';
  btn.style.borderRadius = '6px';
  btn.style.cursor = 'pointer';
  btn.style.fontSize = '13px';
  
  if (isCta) {
    btn.classList.add('mod-cta');
  }
  
  btn.onclick = onClick;
  return btn;
}

export function createSectionTitle(container: HTMLElement, text: string, className: string = 'auto-plus-section-title'): HTMLHeadingElement {
  const title = container.createEl('h4', { text, cls: className });
  title.style.margin = '0 0 12px 0';
  title.style.fontSize = '14px';
  title.style.color = 'var(--text-accent)';
  return title;
}
