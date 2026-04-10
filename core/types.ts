// ***************************************************************************************
// * 核心类型定义 v2.0
// * 集中管理所有业务相关的类型定义
// ***************************************************************************************

import { TFile, CachedMetadata } from 'obsidian';

// ============================================================================
// 条件类型
// ============================================================================

export type ConditionType = 'tag' | 'title' | 'yaml' | 'mtime' | 'path';

export type ActionType =
  | 'move'
  | 'copy'
  | 'moveRename'
  | 'copyRename'
  | 'rename'
  | 'delete'
  | 'updateYaml'
  | 'addTag';

export type YamlOperator =
  | 'equals'
  | 'notEquals'
  | 'exists'
  | 'notExists'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'matches'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'arrayContains'
  | 'arrayNotContains'
  | 'arrayHasAny'
  | 'arrayHasAll';

export type LogicOperator = 'AND' | 'OR';

// ============================================================================
// YAML 值类型 - 完整支持 Obsidian 所有属性类型
// ============================================================================

export type YamlValueType =
  | 'text'        // 单行文本
  | 'list'        // 列表/数组
  | 'number'      // 数字
  | 'checkbox'    // 布尔值
  | 'date'        // 日期 (YYYY-MM-DD)
  | 'datetime'    // 日期时间 (ISO 8601)
  | 'tags'        // 标签类型
  | 'aliases'     // 别名类型
  | 'multitext'   // 多行文本
  | 'unknown';    // 未知类型

export type KeyMatchMode = 'exact' | 'prefix' | 'suffix' | 'contains' | 'regex';

export type YamlArrayMatchMode = 'any' | 'all';

export type SourceFolderMode = 'all' | 'include' | 'exclude';

// ============================================================================
// YAML 条件 - 增强版，支持完整的值类型判断
// ============================================================================

export interface YamlKeyCondition {
  matchMode: KeyMatchMode;
  pattern: string;
  valueOperator?: YamlOperator;
  value?: YamlValue;
  valueType?: YamlValueType;
  arrayMatchMode?: YamlArrayMatchMode;
}

export type YamlValue = string | number | boolean | string[] | number[] | Date | null;

export interface YamlCondition {
  key?: string;
  keyCondition?: YamlKeyCondition;
  operator: YamlOperator;
  value?: YamlValue;
  valueType?: YamlValueType;      // 期望的值类型
  arrayMatchMode?: YamlArrayMatchMode;
  autoInferType?: boolean;        // 是否自动推断类型
  nestedPath?: string;            // 嵌套路径，如 "metadata.author.name"
}

// ============================================================================
// YAML 值判断选项
// ============================================================================

export interface YamlValueOptions {
  caseSensitive?: boolean;        // 文本比较是否区分大小写
  trimWhitespace?: boolean;       // 是否去除首尾空白
  dateFormat?: string;            // 日期格式，如 "YYYY-MM-DD"
  timezone?: string;              // 时区处理
  fuzzyMatch?: boolean;           // 是否启用模糊匹配
  regexFlags?: string;            // 正则表达式标志，如 "gi"
}

// ============================================================================
// 条件
// ============================================================================

export interface Condition {
  type: ConditionType;
  tag?: string;
  pattern?: string;
  yaml?: YamlCondition;
  mtimePattern?: string;
  pathPattern?: string;
}

// ============================================================================
// 目标配置
// ============================================================================

export interface TargetConfig {
  destinationFolder?: string;
  targetFileName?: string;
  overwriteExisting?: boolean;
  updateYamlKey?: string;
  updateYamlValue?: string;
  tagValue?: string;
}

// ============================================================================
// 源文件夹过滤
// ============================================================================

export interface SourceFolderRule {
  mode: SourceFolderMode;
  folders: string[];
  useRegex?: boolean;
  includeChildren?: boolean;
}

export interface ExcludeConfig {
  folders: string[];
  useRegex?: boolean;
  excludeByPattern?: boolean;
}

// ============================================================================
// 规则
// ============================================================================

// ============================================================================
// 规则触发模式
// ============================================================================

export type RuleTriggerMode = 'auto' | 'manual' | 'scheduled';

export interface RuleSchedule {
  cron?: string;           // Cron 表达式，如 "0 9 * * 1" (每周一 9点)
  interval?: number;       // 间隔分钟数
  lastRun?: number;        // 上次运行时间戳
}

export interface Rule {
  id?: string;
  name: string;
  enabled: boolean;
  priority: number;
  triggerMode: RuleTriggerMode;   // 触发模式: auto/manual/scheduled
  schedule?: RuleSchedule;        // 定时配置
  conditions: Condition[];
  logicOperator: LogicOperator;
  action: ActionType;
  target: TargetConfig;
  sourceFilter?: SourceFolderRule;
  excludeFolders?: string[];
}

// ============================================================================
// 插件设置
// ============================================================================

export interface PluginSettings {
  triggerMode: 'auto' | 'manual';
  allowMultipleActions: boolean;
  useRegexForTags: boolean;
  showNotifications: boolean;
  statusBarIndicator: boolean;
  rules: Rule[];
  globalExclude: ExcludeConfig;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  triggerMode: 'auto',
  allowMultipleActions: false,
  useRegexForTags: false,
  showNotifications: true,
  statusBarIndicator: true,
  rules: [],
  globalExclude: {
    folders: [],
    useRegex: false,
    excludeByPattern: false,
  },
};

// ============================================================================
// 文件上下文
// ============================================================================

export interface FileContext {
  file: TFile;
  fileName: string;
  fileFullName: string;
  fileCache: CachedMetadata | null;
  tags: string[] | null;
  frontmatter: Record<string, unknown> | null;
}

// ============================================================================
// 评估结果
// ============================================================================

export interface EvaluationResult {
  matched: boolean;
  condition: Condition;
  reason?: string;
}

export interface RuleMatchResult {
  matched: boolean;
  rule: Rule;
  matchedConditions: EvaluationResult[];
}

// ============================================================================
// 操作上下文
// ============================================================================

export interface ActionContext {
  rule: Rule;
  file: TFile;
  fileFullName: string;
}

// ============================================================================
// 批量处理
// ============================================================================

export type BatchMode = 'preview' | 'execute';

export interface BatchStats {
  total: number;
  matched: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export interface FileProcessResult {
  file: TFile;
  success: boolean;
  action?: string;
  message?: string;
  error?: string;
}

export interface BatchProcessResult {
  ruleId: string;
  ruleName: string;
  mode: BatchMode;
  matchedFiles: TFile[];
  results: FileProcessResult[];
  stats: BatchStats;
  startTime: Date;
  endTime?: Date;
}

export interface BatchPreviewResult {
  ruleId: string;
  ruleName: string;
  matchedFiles: TFile[];
  total: number;
}
