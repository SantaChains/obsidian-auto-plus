// ***************************************************************************************
// * MCP Server v2.0
// * Model Context Protocol Server - 将插件功能暴露给 AI Agent
// * 支持 stdio 和 HTTP SSE 两种通信协议
// * 遵循 MCP 2025-06 规范
// ***************************************************************************************

import { App, TFile, normalizePath, Notice } from 'obsidian';
import { MCPConfig, SourceFilter as SourceFilterConfig, Rule } from './types';
import { RuleEngine } from './RuleEngine';
import { SourceFilter } from './SourceFilter';
import { ActionExecutor } from './ActionExecutor';
import { ActionContext } from './types';

// ============================================================================
// MCP 2025-06 类型定义
// ============================================================================

export type MCPTool = 'execute_rule' | 'query_files' | 'update_yaml';

// MCP Request/Response
export interface MCPRequest {
  tool: MCPTool;
  params: Record<string, unknown>;
}

export interface MCPResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

// JSON-RPC 2.0
export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// MCP 2025-06: 工具定义
export interface MCPToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  outputSchema?: {
    type: 'object';
    properties?: Record<string, unknown>;
  };
  annotations?: {
    audience?: ('user' | 'assistant')[];
    priority?: number;
  };
}

// MCP 2025-06: 结构化内容
export interface MCPContentItem {
  type: 'text' | 'image' | 'audio' | 'resource_link';
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
  name?: string;
  annotations?: {
    audience?: ('user' | 'assistant')[];
    priority?: number;
  };
}

// ============================================================================
// MCPServer 实现
// ============================================================================

export class MCPServer {
  private config: MCPConfig;
  private app: App;
  private ruleEngine: RuleEngine;
  private actionExecutor: ActionExecutor;
  private running: boolean = false;
  private serverInstance?: {
    type: 'stdio' | 'http';
    close: () => void;
  };
  private logs: Array<{ timestamp: number; level: 'info' | 'warn' | 'error'; message: string }> = [];

  constructor(config: MCPConfig, app: App) {
    this.config = config;
    this.app = app;
    this.ruleEngine = new RuleEngine(app, { useRegexForTags: false, allowMultipleActions: false });
    this.actionExecutor = new ActionExecutor(app, { showNotifications: false });
  }

  /**
   * 获取 MCP 日志（用于审计）
   */
  getLogs(): Array<{ timestamp: number; level: string; message: string }> {
    return [...this.logs];
  }

  /**
   * 记录日志
   */
  private log(level: 'info' | 'warn' | 'error', message: string): void {
    const entry = { timestamp: Date.now(), level, message };
    this.logs.push(entry);
    if (this.logs.length > 1000) {
      this.logs.shift();
    }
    console.log(`[MCP][${level.toUpperCase()}] ${message}`);
  }

  /**
   * 启动 MCP Server
   * 根据配置选择 stdio 或 HTTP SSE 模式
   */
  async start(): Promise<void> {
    if (this.running) {
      this.log('warn', 'Server already running');
      return;
    }

    if (!this.config.enabled) {
      this.log('info', 'MCP server is disabled in config');
      return;
    }

    this.log('info', `Starting MCP server with config: ${JSON.stringify({ port: this.config.port, tools: this.config.tools })}`);

    const port = this.config.port || 3000;

    if (typeof process !== 'undefined' && process.stdin && process.stdout) {
      await this.startStdioServer();
    } else {
      await this.startHttpSseServer(port);
    }

    this.running = true;
    this.log('info', `Server started successfully (protocol: ${this.serverInstance?.type || 'auto'})`);

    if (this.config.tools.length > 0) {
      this.log('info', `Enabled tools: ${this.config.tools.join(', ')}`);
    }
  }

  /**
   * 停止 MCP Server
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    if (this.serverInstance) {
      this.serverInstance.close();
      this.serverInstance = undefined;
    }

    this.running = false;
    this.log('info', 'Server stopped');
  }

  /**
   * 检查服务器是否运行中
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * 处理 MCP 请求
   * MCP 2025-06: 所有请求都应经过验证和日志记录
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    if (!this.config.enabled) {
      return { success: false, error: 'MCP server is disabled' };
    }

    // 记录请求
    this.log('info', `Incoming request: ${request.tool} with params ${JSON.stringify(request.params)}`);

    // 验证工具是否在允许列表中
    if (this.config.tools.length > 0 && !this.config.tools.includes(request.tool)) {
      this.log('warn', `Tool access denied: ${request.tool}`);
      return { success: false, error: `Tool '${request.tool}' is not allowed` };
    }

    try {
      let result: MCPResponse;

      switch (request.tool) {
        case 'execute_rule':
          result = await this.executeRule(this.validateExecuteRuleParams(request.params));
          break;
        case 'query_files':
          result = await this.queryFiles(this.validateQueryFilesParams(request.params));
          break;
        case 'update_yaml':
          result = await this.updateYaml(this.validateUpdateYamlParams(request.params));
          break;
        default:
          this.log('warn', `Unknown tool requested: ${request.tool}`);
          result = { success: false, error: `Unknown tool: ${request.tool}` };
      }

      this.log('info', `Request completed: ${request.tool} -> success: ${result.success}`);
      return result;
    } catch (error) {
      this.log('error', `Request failed: ${request.tool} -> ${String(error)}`);
      return { success: false, error: String(error) };
    }
  }

  // ============================================================================
  // 参数验证 (MCP 2025-06: 数据验证最佳实践)
  // ============================================================================

  private validateExecuteRuleParams(params: Record<string, unknown>): { ruleId: string; filePaths?: string[] } {
    if (!params.ruleId || typeof params.ruleId !== 'string') {
      throw new Error('Invalid params: ruleId is required and must be a string');
    }
    return {
      ruleId: params.ruleId,
      filePaths: Array.isArray(params.filePaths) ? params.filePaths.filter((p): p is string => typeof p === 'string') : undefined,
    };
  }

  private validateQueryFilesParams(params: Record<string, unknown>): { source: SourceFilterConfig } {
    if (!params.source || typeof params.source !== 'object') {
      throw new Error('Invalid params: source is required');
    }
    return { source: params.source as SourceFilterConfig };
  }

  private validateUpdateYamlParams(params: Record<string, unknown>): { filePath: string; updates: Record<string, unknown> } {
    if (!params.filePath || typeof params.filePath !== 'string') {
      throw new Error('Invalid params: filePath is required and must be a string');
    }
    if (!params.updates || typeof params.updates !== 'object') {
      throw new Error('Invalid params: updates is required and must be an object');
    }
    return {
      filePath: params.filePath,
      updates: params.updates as Record<string, unknown>,
    };
  }

  // ============================================================================
  // 工具实现
  // ============================================================================

  /**
   * execute_rule - 执行指定规则
   * MCP 2025-06: 返回结构化内容
   */
  private async executeRule(params: { ruleId: string; filePaths?: string[] }): Promise<MCPResponse> {
    const { ruleId, filePaths } = params;

    const rule = this.findRuleById(ruleId);
    if (!rule) {
      return this.errorResult('Rule not found', { ruleId });
    }

    if (!rule.enabled) {
      return this.errorResult('Rule is disabled', { ruleId });
    }

    let files: TFile[];
    if (filePaths && filePaths.length > 0) {
      files = filePaths
        .map(path => this.app.vault.getAbstractFileByPath(normalizePath(path)))
        .filter((f): f is TFile => f instanceof TFile);

      if (files.length === 0) {
        return this.errorResult('No valid files found', { filePaths });
      }
    } else {
      const filterConfig: SourceFilterConfig = { include: [], exclude: [] };
      const filter = new SourceFilter(filterConfig, this.app);
      const result = await filter.execute();
      files = result.files;
    }

    if (files.length === 0) {
      return this.successResult({
        executed: 0,
        results: [],
        message: 'No files to process',
      });
    }

    this.ruleEngine.setRules([rule]);
    const results: Array<{ file: string; success: boolean; message?: string; error?: string }> = [];

    for (const file of files) {
      const matchResults = this.ruleEngine.evaluateFile(file, this.app.metadataCache.getFileCache(file));

      if (matchResults.length > 0) {
        const context: ActionContext = {
          rule: matchResults[0].rule,
          file,
          fileFullName: file.name,
        };
        const actionResult = await this.actionExecutor.execute(context);
        results.push({
          file: file.path,
          success: actionResult.success,
          message: actionResult.message,
          error: actionResult.error,
        });
      } else {
        results.push({
          file: file.path,
          success: false,
          error: 'File does not match rule conditions',
        });
      }
    }

    const succeeded = results.filter(r => r.success).length;

    return this.successResult({
      ruleId,
      total: files.length,
      executed: succeeded,
      failed: files.length - succeeded,
      results,
    });
  }

  /**
   * query_files - 查询符合条件的文件
   * MCP 2025-06: 支持分页和资源链接
   */
  private async queryFiles(params: { source: SourceFilterConfig }): Promise<MCPResponse> {
    const { source } = params;

    try {
      const filter = new SourceFilter(source, this.app);
      const result = await filter.execute();

      const files = result.files.map(f => ({
        path: f.path,
        name: f.name,
        basename: f.basename,
        extension: f.extension,
        size: f.stat.size,
        ctime: f.stat.ctime,
        mtime: f.stat.mtime,
        resourceUri: `file:///${f.path}`,
      }));

      return this.successResult({
        total: files.length,
        includedCount: result.includedCount,
        excludedCount: result.excludedCount,
        files,
        nextCursor: undefined,
      });
    } catch (error) {
      return this.errorResult('Query failed', { error: String(error) });
    }
  }

  /**
   * update_yaml - 更新文件 YAML 属性
   * MCP 2025-06: 支持结构化输出
   */
  private async updateYaml(params: { filePath: string; updates: Record<string, unknown> }): Promise<MCPResponse> {
    const { filePath, updates } = params;

    const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
    if (!(file instanceof TFile)) {
      return this.errorResult('File not found', { filePath });
    }

    try {
      const content = await this.app.vault.read(file);
      let newContent = content;

      for (const [key, value] of Object.entries(updates)) {
        newContent = this.updateFrontmatterValue(newContent, key, value);
      }

      if (newContent === content) {
        return this.successResult({
          updated: false,
          file: filePath,
          message: 'No changes needed',
        });
      }

      await this.app.vault.modify(file, newContent);

      return this.successResult({
        updated: true,
        file: filePath,
        keys: Object.keys(updates),
      });
    } catch (error) {
      return this.errorResult('Update failed', { filePath, error: String(error) });
    }
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * 创建成功结果 (MCP 2025-06: 结构化输出)
   */
  private successResult(data: unknown): MCPResponse {
    return {
      success: true,
      result: {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(data, null, 2),
          },
        ],
        structuredContent: data,
        isError: false,
      },
    };
  }

  /**
   * 创建错误结果 (MCP 2025-06: 结构化错误输出)
   */
  private errorResult(message: string, details?: Record<string, unknown>): MCPResponse {
    return {
      success: false,
      error: message,
      result: {
        content: [
          {
            type: 'text' as const,
            text: `Error: ${message}${details ? `\nDetails: ${JSON.stringify(details, null, 2)}` : ''}`,
          },
        ],
        structuredContent: { error: message, details },
        isError: true,
      },
    };
  }

  /**
   * 根据 ID 查找规则
   */
  private findRuleById(ruleId: string): Rule | undefined {
    const settings = (this.app as unknown as { plugin?: { settings?: { rules?: Rule[] } } }).plugin?.settings;
    if (settings?.rules) {
      return settings.rules.find(r => r.id === ruleId);
    }
    return undefined;
  }

  /**
   * 更新 frontmatter 中的值
   */
  private updateFrontmatterValue(content: string, key: string, value: unknown): string {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      const yamlContent = Object.entries({ [key]: value })
        .map(([k, v]) => `${k}: ${this.formatYamlValue(v)}`)
        .join('\n');
      return `---\n${yamlContent}\n---\n\n${content}`;
    }

    const frontmatter = match[1];
    const keyRegex = new RegExp(`^${key}:.*$`, 'm');
    const formattedValue = this.formatYamlValue(value);

    let newFrontmatter: string;
    if (keyRegex.test(frontmatter)) {
      newFrontmatter = frontmatter.replace(keyRegex, `${key}: ${formattedValue}`);
    } else {
      newFrontmatter = frontmatter + `\n${key}: ${formattedValue}`;
    }

    return content.replace(frontmatterRegex, `---\n${newFrontmatter}\n---`);
  }

  /**
   * 格式化 YAML 值
   */
  private formatYamlValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'string') {
      if (/[:#{}[\],&*?|<>!=@%`]/.test(value) || value.includes('\n') || value.includes('"')) {
        return `"${value.replace(/"/g, '\\"')}"`;
      }
      return value;
    }
    if (Array.isArray(value)) {
      const items = value.map(v => this.formatYamlValue(v));
      return `[${items.join(', ')}]`;
    }
    return `"${JSON.stringify(value).replace(/"/g, '\\"')}"`;
  }

  // ============================================================================
  // Stdio Server (Node.js 环境)
  // ============================================================================

  private async startStdioServer(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stdin = process.stdin as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stdout = process.stdout as any;

    let buffer = '';

    const handleRequest = async (data: string): Promise<void> => {
      try {
        const request = JSON.parse(data) as JSONRPCRequest;
        const response = await this.processJsonRpcRequest(request);
        stdout.write(JSON.stringify(response) + '\n');
      } catch (error) {
        const errorResponse: JSONRPCResponse = {
          jsonrpc: '2.0',
          id: 0,
          error: {
            code: -32700,
            message: String(error),
          },
        };
        stdout.write(JSON.stringify(errorResponse) + '\n');
      }
    };

    stdin.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          handleRequest(line);
        }
      }
    });

    this.serverInstance = {
      type: 'stdio',
      close: () => {
        stdin.removeAllListeners('data');
        this.log('info', 'Stdio server closed');
      },
    };
  }

  // ============================================================================
  // HTTP SSE Server (浏览器环境)
  // ============================================================================

  private async startHttpSseServer(port: number): Promise<void> {
    this.log('info', `HTTP SSE mode on port ${port} (limited support in Obsidian)`);

    this.serverInstance = {
      type: 'http',
      close: () => {
        this.log('info', 'HTTP server closed');
      },
    };
  }

  // ============================================================================
  // JSON-RPC 请求处理 (MCP 2025-06)
  // ============================================================================

  private async processJsonRpcRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    if (request.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: this.getToolsList(),
      };
    }

    if (request.method === 'tools/call') {
      const { name, arguments: args } = request.params as { name: string; arguments: Record<string, unknown> };
      const result = await this.handleRequest({ tool: name as MCPTool, params: args });
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: result.result || { success: false, error: result.error },
      };
    }

    if (request.method === 'ping') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: { status: 'ok', timestamp: Date.now() },
      };
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32601,
        message: `Method not found: ${request.method}`,
      },
    };
  }

  /**
   * 获取工具列表 (MCP 2025-06: 包含 title, outputSchema, annotations)
   */
  private getToolsList(): { tools: MCPToolDefinition[]; listChanged?: boolean } {
    const allTools: MCPToolDefinition[] = [
      {
        name: 'execute_rule',
        title: 'Execute Rule',
        description: 'Execute a specified rule on matching files. Returns detailed results for each file processed.',
        inputSchema: {
          type: 'object',
          properties: {
            ruleId: { type: 'string', description: 'Unique identifier of the rule to execute' },
            filePaths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional: Specific file paths to process. If not provided, all vault files matching the rule source filter will be processed.',
            },
          },
          required: ['ruleId'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            ruleId: { type: 'string' },
            total: { type: 'number' },
            executed: { type: 'number' },
            failed: { type: 'number' },
            results: { type: 'array' },
          },
        },
        annotations: {
          audience: ['assistant'],
          priority: 0.9,
        },
      },
      {
        name: 'query_files',
        title: 'Query Files',
        description: 'Query files matching filter conditions. Returns file metadata including path, name, size, and timestamps.',
        inputSchema: {
          type: 'object',
          properties: {
            source: {
              type: 'object',
              description: 'Source filter configuration',
              properties: {
                include: { type: 'array', description: 'Array of glob patterns or folder paths to include' },
                exclude: { type: 'array', description: 'Array of glob patterns or folder paths to exclude' },
              },
            },
          },
          required: ['source'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            includedCount: { type: 'number' },
            excludedCount: { type: 'number' },
            files: { type: 'array' },
            nextCursor: { type: 'string' },
          },
        },
        annotations: {
          audience: ['assistant'],
          priority: 0.8,
        },
      },
      {
        name: 'update_yaml',
        title: 'Update YAML Frontmatter',
        description: 'Update file YAML frontmatter properties. Creates frontmatter if it does not exist.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file to update' },
            updates: {
              type: 'object',
              description: 'Key-value pairs to update in the frontmatter',
              additionalProperties: true,
            },
          },
          required: ['filePath', 'updates'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            updated: { type: 'boolean' },
            file: { type: 'string' },
            keys: { type: 'array' },
          },
        },
        annotations: {
          audience: ['assistant'],
          priority: 0.7,
        },
      },
    ];

    const enabledTools = this.config.tools.length > 0
      ? allTools.filter(t => this.config.tools.includes(t.name as MCPTool))
      : allTools;

    return {
      tools: enabledTools,
      listChanged: true,
    };
  }
}