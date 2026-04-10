// ***************************************************************************************
// * 核心类型定义 v2.0
// * 集中管理所有业务相关的类型定义
// ***************************************************************************************

import { TFile, CachedMetadata } from 'obsidian';

// ============================================================================
// 条件类型
// ============================================================================

export type ConditionType = 'tag' | 'title' | 'yaml' | 'mtime' | 'path' | 'content';

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
  contentPattern?: string;  // 正文内容匹配
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
  triggerMode: RuleTriggerMode;
  schedule?: RuleSchedule;
  conditions: Condition[];
  logicOperator: LogicOperator;
  action: ActionType;
  target: TargetConfig;
  sourceFilter?: SourceFolderRule;
  excludeFolders?: string[];
  loopConfig?: LoopConfig;
}

// ============================================================================
// 插件设置
// ============================================================================

export interface LogRetentionConfig {
  maxFiles: number;
  maxDays: number;
}

export interface PluginSettings {
  triggerMode: 'auto' | 'manual';
  allowMultipleActions: boolean;
  useRegexForTags: boolean;
  showNotifications: boolean;
  statusBarIndicator: boolean;
  rules: Rule[];
  globalExclude: ExcludeConfig;
  logEnabled: boolean;
  logRetention: LogRetentionConfig;
  deleteMode: 'permanent' | 'trash';
  concurrentMode: 'sequential' | 'parallel';
  aiEnabled: boolean;
  httpEnabled: boolean;
  mcpEnabled: boolean;
  dryRunEnabled: boolean;
  batchProgressEnabled: boolean;
  defaultErrorStrategy: ErrorStrategy;
  maxConcurrentRules: number;
  startupRunEnabled: boolean;
  safeMode: boolean;
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
  logEnabled: true,
  logRetention: { maxFiles: 30, maxDays: 7 },
  deleteMode: 'trash',
  concurrentMode: 'sequential',
  aiEnabled: false,
  httpEnabled: false,
  mcpEnabled: false,
  dryRunEnabled: true,
  batchProgressEnabled: true,
  defaultErrorStrategy: 'stop',
  maxConcurrentRules: 3,
  startupRunEnabled: false,
  safeMode: false,
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

// ============================================================================
// SourceFilter 白名单模型
// ============================================================================

export type SourceItemType = 'file' | 'folder' | 'yaml' | 'metadata';

export interface SourceItem {
  type: SourceItemType;
  path?: string;
  yaml?: {
    key: string;
    operator: string;
    value: YamlValue;
  };
  metadata?: {
    field: 'ctime' | 'mtime';
    operator: string;
    value: string;
  };
}

export interface SourceFilter {
  include: SourceItem[];
  exclude: SourceItem[];
}

// ============================================================================
// LoopConfig 循环配置
// ============================================================================

export type LoopType = 'forEach' | 'while' | 'doWhile';

export interface LoopConfig {
  type: LoopType;
  items?: unknown[] | string;
  variable?: string;
  condition?: string;
  maxIterations?: number;
  continueOnError?: boolean;
}

// ============================================================================
// AIRequest AI 请求
// ============================================================================

export type AIProvider = 'openai' | 'anthropic' | 'custom';
export type AIOperation = 'summarize' | 'classify' | 'generate' | 'extract' | 'translate';

export interface AIRequest {
  provider: AIProvider;
  operation: AIOperation;
  prompt?: string;
  model?: string;
  outputVar?: string;
  apiKey?: string;
  endpoint?: string;
}

// ============================================================================
// HTTPRequest HTTP 请求
// ============================================================================

export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface HTTPRequest {
  method: HTTPMethod;
  url: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  timeout?: number;
  outputVar?: string;
}

export interface HTTPResponse {
  success: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
  error?: string;
}

// ============================================================================
// MCPConfig MCP 配置
// ============================================================================

export interface MCPConfig {
  enabled: boolean;
  port?: number;
  tools: string[];
}

// ============================================================================
// DryRunConfig 模拟配置
// ============================================================================

export interface DryRunConfig {
  enabled: boolean;
  preview: {
    showAffectedFiles: boolean;
    showActions: boolean;
    showChanges: boolean;
  };
}

// ============================================================================
// BatchProgress 批量进度
// ============================================================================

export interface BatchProgress {
  enabled: boolean;
  showDialog: boolean;
  canCancel: boolean;
  updateInterval: number;
}

// ============================================================================
// ErrorHandling 错误恢复
// ============================================================================

export type ErrorStrategy = 'retry' | 'rollback' | 'skip' | 'stop';

export interface ErrorHandling {
  strategy: ErrorStrategy;
  maxRetries?: number;
  retryDelay?: number;
  rollbackOnFailure?: boolean;
}

// ============================================================================
// ActionType 扩展
// ============================================================================

export type ActionTypeExtended =
  | ActionType
  | 'content.replace'
  | 'content.insert'
  | 'content.extract'
  | 'http.request'
  | 'ai.request';

// 内容操作参数类型
export interface ContentReplaceParams {
  pattern: string;
  replacement: string;
  flags?: string;
  useRegex?: boolean;
}

export interface ContentInsertParams {
  position: 'start' | 'end' | number;
  content: string;
}

export interface ContentExtractParams {
  pattern: string;
  group?: number;
}

export interface HttpRequestParams {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  timeout?: number;
}

export interface AIRequestParams {
  provider: 'openai' | 'anthropic' | 'custom';
  operation: 'summarize' | 'classify' | 'generate' | 'extract' | 'translate';
  prompt: string;
  model?: string;
  apiKey?: string;
}

// ============================================================================
// ActionResult 操作结果
// ============================================================================

export interface ActionResult {
  success: boolean;
  action: string;
  fileName: string;
  message?: string;
  error?: string;
}

// ============================================================================
// Action 操作接口
// ============================================================================

export type ActionSubType = 'file' | 'metadata' | 'content' | 'system' | 'ai' | 'http' | 'mcp';

export interface Action {
  id: string;
  name: string;
  type: ActionSubType;
  actionType: ActionType | ActionTypeExtended;
  params: Record<string, unknown>;
  enabled: boolean;
  description?: string;
  useTemplate?: string;
  dryRun?: boolean;
}

// ============================================================================
// Template 模板接口
// ============================================================================

export type TemplateType = 'rule' | 'action' | 'condition';

export interface Template {
  id: string;
  name: string;
  type: TemplateType;
  description?: string;
  data: Partial<Rule> | Partial<Action> | Condition | SourceFilter;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
}

// ============================================================================
// Settings 别名 (兼容旧命名)
// ============================================================================

export type Settings = PluginSettings;
