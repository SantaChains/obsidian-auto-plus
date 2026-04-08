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

export type YamlValueType = 'boolean' | 'number' | 'string' | 'array' | 'null';

export type KeyMatchMode = 'exact' | 'prefix' | 'suffix' | 'contains' | 'regex';

export type YamlArrayMatchMode = 'any' | 'all';

export type SourceFolderMode = 'all' | 'include' | 'exclude';

// ============================================================================
// YAML 条件
// ============================================================================

export interface YamlKeyCondition {
  matchMode: KeyMatchMode;
  pattern: string;
  valueOperator?: YamlOperator;
  value?: string | number | boolean;
  arrayMatchMode?: YamlArrayMatchMode;
}

export interface YamlCondition {
  key?: string;
  keyCondition?: YamlKeyCondition;
  operator: YamlOperator;
  value?: string | number | boolean;
  arrayMatchMode?: YamlArrayMatchMode;
  autoInferType?: boolean;
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

export interface Rule {
  id?: string;
  name: string;
  enabled: boolean;
  priority: number;
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
