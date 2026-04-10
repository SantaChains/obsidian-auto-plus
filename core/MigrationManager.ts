// ***************************************************************************************
// * MigrationManager.ts - 版本迁移管理器
// * 功能：支持数据版本检测、自动迁移、备份与回滚
// ***************************************************************************************

import { App, Notice, Modal } from 'obsidian';
import { Rule, ActionType, Condition, ConditionType, YamlCondition } from './types';

// ============================================================================
// 迁移命令接口
// ============================================================================

export interface MigrationCommand {
  fromVersion: string;
  toVersion: string;
  migrate: (data: unknown) => Promise<unknown>;
  validate?: (data: unknown) => boolean;
}

export interface MigrationResult {
  success: boolean;
  migratedData?: unknown;
  error?: string;
  backupPath?: string;
}

// ============================================================================
// v0.x 旧版数据结构（用于迁移）
// ============================================================================

interface OldRuleFormat {
  id?: string;
  name: string;
  enabled?: boolean;
  trigger?: {
    type?: string;
    mode?: string;
  };
  source?: {
    folders?: string[];
    tags?: string[];
  };
  conditions?: Array<{
    type?: ConditionType;
    tag?: string;
    pattern?: string;
    yaml?: YamlCondition;
    pathPattern?: string;
    mtimePattern?: string;
  }>;
  conditionLogic?: 'AND' | 'OR';
  actionIds?: string[];
  actions?: Array<{
    type: ActionType;
    params?: Record<string, unknown>;
  }>;
}

interface OldDataFormat {
  version?: string;
  rules?: OldRuleFormat[];
  actions?: Array<{
    id: string;
    name: string;
    type: ActionType;
    config?: Record<string, unknown>;
  }>;
  templates?: Array<{
    id: string;
    name: string;
    content: string;
  }>;
  settings?: Record<string, unknown>;
}

// ============================================================================
// MigrationManager 类
// ============================================================================

export class MigrationManager {
  private migrations: Map<string, MigrationCommand>;
  private app: App;

  constructor(app: App) {
    this.app = app;
    this.migrations = new Map();
    this.registerBuiltInMigrations();
  }

  // ============================================================================
  // 注册迁移脚本
  // ============================================================================

  registerMigration(migration: MigrationCommand): void {
    const key = `${migration.fromVersion}->${migration.toVersion}`;
    this.migrations.set(key, migration);
  }

  // ============================================================================
  // 检测版本
  // ============================================================================

  detectVersion(data: unknown): string {
    if (!data || typeof data !== 'object') {
      return 'unknown';
    }

    const obj = data as Record<string, unknown>;

    // 检查 version 字段
    if (typeof obj.version === 'string') {
      return obj.version;
    }

    // 检查旧版格式特征
    if (Array.isArray(obj.rules) && obj.rules.length > 0) {
      const firstRule = obj.rules[0] as OldRuleFormat;
      // v0.x 特征：无 version 字段，rules 内含 actionIds 或无 actions
      if (firstRule.actionIds || !firstRule.actions) {
        return '0.x';
      }
    }

    // 检查是否有 version 字段
    if ('version' in obj) {
      return String(obj.version);
    }

    return 'unknown';
  }

  // ============================================================================
  // 执行迁移
  // ============================================================================

  async migrate(
    data: unknown,
    fromVersion: string,
    toVersion: string
  ): Promise<MigrationResult> {
    const migrationKey = `${fromVersion}->${toVersion}`;
    const migration = this.migrations.get(migrationKey);

    if (!migration) {
      return {
        success: false,
        error: `未找到迁移路径: ${fromVersion} -> ${toVersion}`,
      };
    }

    try {
      // 验证数据
      if (migration.validate && !migration.validate(data)) {
        return {
          success: false,
          error: '数据验证失败',
        };
      }

      // 创建备份
      const backupPath = await this.createBackup(data);

      // 执行迁移
      const migratedData = await migration.migrate(data);

      return {
        success: true,
        migratedData,
        backupPath,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============================================================================
  // 创建备份
  // ============================================================================

  async createBackup(data: unknown): Promise<string> {
    const backupDir = '.obsidian/note-mv-plus/backups';
    const timestamp = Date.now();
    const version = this.detectVersion(data);
    const backupPath = `${backupDir}/backup-${version}-${timestamp}.json`;

    try {
      // 确保备份目录存在
      const adapter = this.app.vault.adapter;
      const exists = await adapter.exists(backupDir);
      if (!exists) {
        await adapter.mkdir(backupDir);
      }

      // 写入备份
      const content = JSON.stringify({
        version,
        timestamp,
        data,
      }, null, 2);
      await adapter.write(backupPath, content);

      return backupPath;
    } catch (error) {
      console.error('创建备份失败:', error);
      throw error;
    }
  }

  // ============================================================================
  // 回滚
  // ============================================================================

  async rollback(backupPath: string): Promise<unknown> {
    try {
      const adapter = this.app.vault.adapter;
      const exists = await adapter.exists(backupPath);

      if (!exists) {
        throw new Error(`备份文件不存在: ${backupPath}`);
      }

      const content = await adapter.read(backupPath);
      const backup = JSON.parse(content);

      return backup.data;
    } catch (error) {
      console.error('回滚失败:', error);
      throw error;
    }
  }

  // ============================================================================
  // 内置迁移：v0.x → v1.0.0
  // ============================================================================

  private registerBuiltInMigrations(): void {
    this.registerMigration({
      fromVersion: '0.x',
      toVersion: '1.0.0',
      migrate: this.migrateV0ToV1.bind(this),
      validate: this.validateV1Schema.bind(this),
    });
  }

  /**
   * v0.x → v1.0.0 迁移逻辑
   */
  private async migrateV0ToV1(data: unknown): Promise<unknown> {
    const old = data as OldDataFormat;

    return {
      version: '1.0.0',
      rules: (old.rules || []).map((r, index) => ({
        id: r.id || `rule-${Date.now()}-${index}`,
        name: r.name,
        enabled: r.enabled ?? true,
        trigger: this.convertTrigger(r.trigger),
        source: this.convertSource(r.source),
        conditions: this.convertConditions(r.conditions || []),
        actions: r.actionIds || this.convertActions(r.actions),
      })),
      actions: this.convertActionDefs(old.actions),
      templates: old.templates || [],
      settings: old.settings || {},
    };
  }

  /**
   * 转换触发器配置
   */
  private convertTrigger(trigger?: OldRuleFormat['trigger']): Record<string, unknown> {
    if (!trigger) {
      return { type: 'file_change', mode: 'auto' };
    }

    return {
      type: trigger.type || 'file_change',
      mode: trigger.mode || 'auto',
    };
  }

  /**
   * 转换源配置
   */
  private convertSource(source?: OldRuleFormat['source']): Record<string, unknown> {
    if (!source) {
      return { folders: [], tags: [] };
    }

    return {
      folders: source.folders || [],
      tags: source.tags || [],
    };
  }

  /**
   * 转换条件列表
   */
  private convertConditions(conditions?: OldRuleFormat['conditions']): Condition[] {
    if (!conditions || !Array.isArray(conditions)) {
      return [];
    }
    return conditions.map((c, index) => ({
      id: `cond-${Date.now()}-${index}`,
      type: (c.type || 'tag') as ConditionType,
      tag: c.tag,
      pattern: c.pattern,
      yaml: c.yaml,
      pathPattern: c.pathPattern,
      mtimePattern: c.mtimePattern,
    }));
  }

  /**
   * 转换动作列表
   */
  private convertActions(
    actions?: OldRuleFormat['actions']
  ): Array<{ id: string; type: ActionType; params: Record<string, unknown> }> {
    if (!actions || !Array.isArray(actions)) {
      return [];
    }

    return actions.map((a, index) => ({
      id: `action-${Date.now()}-${index}`,
      type: a.type,
      params: a.params || {},
    }));
  }

  /**
   * 转换动作定义
   */
  private convertActionDefs(
    actions?: OldDataFormat['actions']
  ): Array<{
    id: string;
    name: string;
    type: ActionType;
    config: Record<string, unknown>;
  }> {
    if (!actions) {
      return [];
    }

    return actions.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      config: a.config || {},
    }));
  }

  /**
   * 验证 v1.0.0 格式
   */
  private validateV1Schema(data: unknown): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const obj = data as Record<string, unknown>;

    // 必须是对象
    if (typeof obj !== 'object') {
      return false;
    }

    // rules 应为数组
    if (!Array.isArray(obj.rules)) {
      return false;
    }

    // 每个 rule 应有 name
    for (const rule of obj.rules) {
      if (typeof rule !== 'object' || !rule) {
        return false;
      }
      const r = rule as Record<string, unknown>;
      if (typeof r.name !== 'string') {
        return false;
      }
    }

    return true;
  }

  // ============================================================================
  // 迁移确认对话框
  // ============================================================================

  async promptMigration(): Promise<boolean> {
    return new Promise(resolve => {
      const modal = new Modal(this.app);
      modal.titleEl.setText('数据迁移');
      modal.contentEl.createDiv().setText('检测到旧版本数据，是否迁移到 v1.0.0？');
      modal.contentEl.createDiv('modal-buttons', (buttons) => {
        buttons.createEl('button', { text: '迁移' }).addEventListener('click', () => {
          new Notice('开始迁移数据...', 2000);
          modal.close();
          resolve(true);
        });
        buttons.createEl('button', { text: '取消' }).addEventListener('click', () => {
          modal.close();
          resolve(false);
        });
      });
      modal.open();
    });
  }

  // ============================================================================
  // 获取已注册的迁移列表
  // ============================================================================

  getRegisteredMigrations(): Array<{ from: string; to: string }> {
    const list: Array<{ from: string; to: string }> = [];
    for (const key of this.migrations.keys()) {
      const [from, to] = key.split('->');
      list.push({ from, to });
    }
    return list;
  }
}

// ============================================================================
// 导出函数
// ============================================================================

/**
 * 创建迁移管理器实例
 */
export function createMigrationManager(app: App): MigrationManager {
  return new MigrationManager(app);
}

/**
 * 检测并迁移数据
 */
export async function detectAndMigrate(
  app: App,
  data: unknown
): Promise<MigrationResult> {
  const manager = new MigrationManager(app);
  const version = manager.detectVersion(data);

  // 如果已是最新版本
  if (version === '1.0.0' || version === 'unknown') {
    return {
      success: true,
      migratedData: data,
    };
  }

  // 提示用户确认迁移
  const confirmed = await manager.promptMigration();
  if (!confirmed) {
    return {
      success: false,
      error: '用户取消迁移',
    };
  }

  // 执行迁移
  return manager.migrate(data, version, '1.0.0');
}

export default MigrationManager;
