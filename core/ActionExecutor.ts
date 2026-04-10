// ***************************************************************************************
// * 操作执行器 v3.0
// * 负责执行文件操作（移动、复制、删除、重命名）
// * 支持新的目标配置：destinationFolder + targetFileName 分离
// * 支持内容操作（替换/插入/提取）、HTTP 请求、AI 请求
// ***************************************************************************************

import { App, Notice, TFile, TFolder, normalizePath } from 'obsidian';
import { Rule, ActionContext, ActionType } from './types';

// 新操作类型定义
export type ContentOperationType = 'content.replace' | 'content.insert' | 'content.extract';
export type HttpOperationType = 'http.request';
export type AIOperationType = 'ai.request';
export type ExtendedActionType = ActionType | ContentOperationType | HttpOperationType | AIOperationType;

// 内容操作参数
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

export interface ExecutorOptions {
  showNotifications: boolean;
  notificationPrefix?: string;
}

export interface ActionResult {
  success: boolean;
  action: string;
  fileName: string;
  message?: string;
  error?: string;
}

export class ActionExecutor {
  private app: App;
  private options: ExecutorOptions;

  constructor(app: App, options: ExecutorOptions = { showNotifications: true, notificationPrefix: 'Auto Plus' }) {
    this.app = app;
    this.options = options;
  }

  setOptions(options: Partial<ExecutorOptions>): void {
    this.options = { ...this.options, ...options };
  }

  async execute(context: ActionContext): Promise<ActionResult> {
    const { rule, file, fileFullName } = context;
    const action = rule.action as ExtendedActionType;

    switch (action) {
      case 'move':
        return this.moveFile(rule, file, fileFullName);
      case 'copy':
        return this.copyFile(rule, file, fileFullName);
      case 'moveRename':
        return this.moveRenameFile(rule, file, fileFullName);
      case 'copyRename':
        return this.copyRenameFile(rule, file, fileFullName);
      case 'rename':
        return this.renameFile(rule, file);
      case 'delete':
        return this.deleteFile(file);
      case 'updateYaml':
        return this.updateYamlProperty(rule, file);
      case 'addTag':
        return this.addTagToFile(rule, file);
      case 'content.replace':
        return this.contentReplace(rule, file);
      case 'content.insert':
        return this.contentInsert(rule, file);
      case 'content.extract':
        return this.contentExtract(rule, file);
      case 'http.request':
        return this.httpRequest(rule, file);
      case 'ai.request':
        return this.aiRequest(rule, file);
      default:
        return { success: false, action: rule.action, fileName: fileFullName, error: `Unknown action: ${rule.action}` };
    }
  }

  private async moveFile(rule: Rule, file: TFile, fileFullName: string): Promise<ActionResult> {
    const destFolder = rule.target.destinationFolder;
    if (!destFolder) {
      return { success: false, action: 'move', fileName: fileFullName, error: '目标文件夹未指定' };
    }

    if (!this.folderExists(destFolder)) {
      return { success: false, action: 'move', fileName: fileFullName, error: `目标文件夹 "${destFolder}" 不存在` };
    }

    const newPath = normalizePath(`${destFolder}/${fileFullName}`);

    if (this.fileExists(newPath) && newPath !== file.path) {
      return { success: false, action: 'move', fileName: fileFullName, error: `目标文件夹中已存在同名文件 "${fileFullName}"` };
    }

    if (newPath === file.path) {
      return { success: true, action: 'move', fileName: fileFullName, message: '文件已在目标位置' };
    }

    await this.app.fileManager.renameFile(file, newPath);
    return { success: true, action: 'move', fileName: fileFullName, message: `已移动 "${fileFullName}" 到 "${destFolder}"` };
  }

  private async copyFile(rule: Rule, file: TFile, fileFullName: string): Promise<ActionResult> {
    const destFolder = rule.target.destinationFolder;
    if (!destFolder) {
      return { success: false, action: 'copy', fileName: fileFullName, error: '目标文件夹未指定' };
    }

    if (!this.folderExists(destFolder)) {
      return { success: false, action: 'copy', fileName: fileFullName, error: `目标文件夹 "${destFolder}" 不存在` };
    }

    const newPath = normalizePath(`${destFolder}/${fileFullName}`);

    if (this.fileExists(newPath)) {
      return { success: false, action: 'copy', fileName: fileFullName, error: `目标文件夹中已存在同名文件 "${fileFullName}"` };
    }

    await this.app.vault.copy(file, newPath);
    return { success: true, action: 'copy', fileName: fileFullName, message: `已复制 "${fileFullName}" 到 "${destFolder}"` };
  }

  private async moveRenameFile(rule: Rule, file: TFile, fileFullName: string): Promise<ActionResult> {
    const destFolder = rule.target.destinationFolder;
    const targetName = rule.target.targetFileName;

    if (!destFolder) {
      return { success: false, action: 'moveRename', fileName: fileFullName, error: '目标文件夹未指定' };
    }

    if (!targetName) {
      return { success: false, action: 'moveRename', fileName: fileFullName, error: '目标文件名未指定' };
    }

    if (!this.folderExists(destFolder)) {
      return { success: false, action: 'moveRename', fileName: fileFullName, error: `目标文件夹 "${destFolder}" 不存在` };
    }

    const newFileName = this.parseTemplate(targetName, file);
    const newPath = normalizePath(`${destFolder}/${newFileName}`);

    if (this.fileExists(newPath) && newPath !== file.path) {
      return { success: false, action: 'moveRename', fileName: fileFullName, error: `已存在同名文件 "${newFileName}"` };
    }

    await this.app.fileManager.renameFile(file, newPath);
    return { success: true, action: 'moveRename', fileName: fileFullName, message: `已移动并重命名 "${fileFullName}" → "${newFileName}"` };
  }

  private async copyRenameFile(rule: Rule, file: TFile, fileFullName: string): Promise<ActionResult> {
    const destFolder = rule.target.destinationFolder;
    const targetName = rule.target.targetFileName;

    if (!destFolder) {
      return { success: false, action: 'copyRename', fileName: fileFullName, error: '目标文件夹未指定' };
    }

    if (!targetName) {
      return { success: false, action: 'copyRename', fileName: fileFullName, error: '目标文件名未指定' };
    }

    if (!this.folderExists(destFolder)) {
      return { success: false, action: 'copyRename', fileName: fileFullName, error: `目标文件夹 "${destFolder}" 不存在` };
    }

    const newFileName = this.parseTemplate(targetName, file);
    const newPath = normalizePath(`${destFolder}/${newFileName}`);

    if (this.fileExists(newPath)) {
      return { success: false, action: 'copyRename', fileName: fileFullName, error: `已存在同名文件 "${newFileName}"` };
    }

    await this.app.vault.copy(file, newPath);
    return { success: true, action: 'copyRename', fileName: fileFullName, message: `已复制并重命名 "${fileFullName}" → "${newFileName}"` };
  }

  private async renameFile(rule: Rule, file: TFile): Promise<ActionResult> {
    const targetName = rule.target.targetFileName;

    if (!targetName) {
      return { success: false, action: 'rename', fileName: file.name, error: '重命名模板未指定' };
    }

    const newFileName = this.parseTemplate(targetName, file);
    const targetFolder = file.parent?.path || '';
    const newPath = normalizePath(`${targetFolder}/${newFileName}`);

    if (this.fileExists(newPath) && newPath !== file.path) {
      return { success: false, action: 'rename', fileName: file.name, error: `已存在同名文件 "${newFileName}"` };
    }

    if (newFileName === file.name) {
      return { success: true, action: 'rename', fileName: file.name, message: '文件名未改变' };
    }

    await this.app.fileManager.renameFile(file, newPath);
    return { success: true, action: 'rename', fileName: file.name, message: `已重命名为 "${newFileName}"` };
  }

  private async deleteFile(file: TFile): Promise<ActionResult> {
    await this.app.vault.delete(file);
    return { success: true, action: 'delete', fileName: file.name, message: `已删除 "${file.name}"` };
  }

  private parseTemplate(template: string, file: TFile): string {
    const fileCache = this.app.metadataCache.getFileCache(file);
    const frontmatter = fileCache?.frontmatter || {};

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '-');
    const datetimeStr = `${dateStr}-${timeStr}`;

    return template
      .replace(/\{\{title\}\}/g, file.basename)
      .replace(/\{\{ext\}\}/g, file.extension)
      .replace(/\{\{date\}\}/g, dateStr)
      .replace(/\{\{time\}\}/g, timeStr)
      .replace(/\{\{datetime\}\}/g, datetimeStr)
      .replace(/\{\{parent\}\}/g, file.parent?.name || '')
      .replace(/\{\{mtime\}\}/g, new Date(file.stat.mtime).toISOString().replace(/[:.]/g, '-'))
      .replace(/\{\{ctime\}\}/g, new Date(file.stat.ctime).toISOString().replace(/[:.]/g, '-'))
      .replace(/\{\{yaml:(\w+)\}\}/g, (_match, key) => {
        return frontmatter[key] !== undefined ? String(frontmatter[key]) : _match;
      });
  }

  private folderExists(path: string): boolean {
    const folder = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return folder instanceof TFolder;
  }

  private fileExists(path: string): boolean {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return file instanceof TFile;
  }

  private async updateYamlProperty(rule: Rule, file: TFile): Promise<ActionResult> {
    const yamlKey = rule.target.updateYamlKey || rule.target.targetFileName;
    const yamlValue = rule.target.updateYamlValue || rule.target.destinationFolder;

    if (!yamlKey) {
      return { success: false, action: 'updateYaml', fileName: file.name, error: 'YAML 属性名未指定' };
    }

    try {
      const fileCache = this.app.metadataCache.getFileCache(file);
      const frontmatter = fileCache?.frontmatter || {};
      const newValue = this.parseTemplate(yamlValue || '', file);
      const content = await this.app.vault.read(file);
      const updatedContent = this.updateFrontmatter(content, yamlKey, newValue);
      await this.app.vault.modify(file, updatedContent);
      return { success: true, action: 'updateYaml', fileName: file.name, message: `已更新 ${yamlKey}: ${newValue}` };
    } catch (error) {
      return { success: false, action: 'updateYaml', fileName: file.name, error: String(error) };
    }
  }

  private async addTagToFile(rule: Rule, file: TFile): Promise<ActionResult> {
    const tagValue = rule.target.tagValue || rule.target.targetFileName;

    if (!tagValue) {
      return { success: false, action: 'addTag', fileName: file.name, error: '标签未指定' };
    }

    try {
      const newTag = this.parseTemplate(tagValue, file);
      const normalizedTag = newTag.startsWith('#') ? newTag : `#${newTag}`;
      const fileCache = this.app.metadataCache.getFileCache(file);
      const existingTags = fileCache?.frontmatter?.tags || [];

      if (Array.isArray(existingTags) && existingTags.includes(newTag.replace(/^#/, ''))) {
        return { success: true, action: 'addTag', fileName: file.name, message: '标签已存在' };
      }

      const content = await this.app.vault.read(file);
      const tagValueClean = newTag.replace(/^#/, '');
      const updatedContent = this.addTagToFrontmatter(content, tagValueClean);
      await this.app.vault.modify(file, updatedContent);
      return { success: true, action: 'addTag', fileName: file.name, message: `已添加标签 ${normalizedTag}` };
    } catch (error) {
      return { success: false, action: 'addTag', fileName: file.name, error: String(error) };
    }
  }

  private updateFrontmatter(content: string, key: string, value: string): string {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return `---\n${key}: ${this.formatYamlValue(value)}\n---\n\n${content}`;
    }

    const frontmatter = match[1];
    const keyRegex = new RegExp(`^${key}:.*$`, 'm');

    let newFrontmatter: string;
    if (keyRegex.test(frontmatter)) {
      newFrontmatter = frontmatter.replace(keyRegex, `${key}: ${this.formatYamlValue(value)}`);
    } else {
      newFrontmatter = frontmatter + `\n${key}: ${this.formatYamlValue(value)}`;
    }

    return content.replace(frontmatterRegex, `---\n${newFrontmatter}\n---`);
  }

  private addTagToFrontmatter(content: string, tag: string): string {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return `---\ntags:\n  - ${tag}\n---\n\n${content}`;
    }

    const frontmatter = match[1];
    const tagsRegex = /^tags:\s*\n((\s+-.*\n)*)/m;
    const tagsMatch = frontmatter.match(tagsRegex);

    let newFrontmatter: string;
    if (tagsMatch) {
      newFrontmatter = frontmatter.replace(tagsRegex, `tags:\n${tagsMatch[1]}  - ${tag}\n`);
    } else if (frontmatter.includes('tags:')) {
      const tagsLineRegex = /^tags:\s*(.+)$/m;
      const lineMatch = frontmatter.match(tagsLineRegex);
      if (lineMatch) {
        const existingTag = lineMatch[1].trim();
        newFrontmatter = frontmatter.replace(tagsLineRegex, `tags:\n  - ${existingTag}\n  - ${tag}`);
      } else {
        newFrontmatter = frontmatter + `\ntags:\n  - ${tag}`;
      }
    } else {
      newFrontmatter = frontmatter + `\ntags:\n  - ${tag}`;
    }

    return content.replace(frontmatterRegex, `---\n${newFrontmatter}\n---`);
  }

  private formatYamlValue(value: string): string {
    if (/[:#{}[\],&*?|<>!=@%`]/.test(value) || value.includes('\n')) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }

  // ============================================================================
  // 变量替换 - 支持 {{filename}}, {{ext}}, {{ctime}}, {{mtime}}, {{yaml.*}}, {{tags}}
  // ============================================================================

  private replaceVariables(text: string, file: TFile): string {
    const fileCache = this.app.metadataCache.getFileCache(file);
    const frontmatter = fileCache?.frontmatter || {};
    const tags = fileCache?.tags || [];

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '-');
    const datetimeStr = `${dateStr}-${timeStr}`;

    return text
      .replace(/\{\{filename\}\}/g, file.basename)
      .replace(/\{\{ext\}\}/g, file.extension)
      .replace(/\{\{date\}\}/g, dateStr)
      .replace(/\{\{time\}\}/g, timeStr)
      .replace(/\{\{datetime\}\}/g, datetimeStr)
      .replace(/\{\{ctime\}\}/g, new Date(file.stat.ctime).toISOString().replace(/[:.]/g, '-'))
      .replace(/\{\{mtime\}\}/g, new Date(file.stat.mtime).toISOString().replace(/[:.]/g, '-'))
      .replace(/\{\{parent\}\}/g, file.parent?.name || '')
      .replace(/\{\{path\}\}/g, file.path)
      .replace(/\{\{tags\}\}/g, tags.map(t => t.tag).join(', '))
      .replace(/\{\{yaml\.(\w+)\}\}/g, (_match, key) => {
        return frontmatter[key] !== undefined ? String(frontmatter[key]) : _match;
      });
  }

  // ============================================================================
  // 内容操作实现
  // ============================================================================

  private async contentReplace(rule: Rule, file: TFile): Promise<ActionResult> {
    const params = rule.target as unknown as ContentReplaceParams;
    const { pattern, replacement, flags = 'g', useRegex = true } = params;

    if (!pattern) {
      return { success: false, action: 'content.replace', fileName: file.name, error: '替换模式未指定' };
    }

    try {
      const content = await this.app.vault.read(file);
      const resolvedPattern = this.replaceVariables(pattern, file);
      const resolvedReplacement = this.replaceVariables(replacement, file);

      let newContent: string;
      if (useRegex) {
        newContent = content.replace(new RegExp(resolvedPattern, flags), resolvedReplacement);
      } else {
        newContent = content.split(resolvedPattern).join(resolvedReplacement);
      }

      if (newContent === content) {
        return { success: true, action: 'content.replace', fileName: file.name, message: '内容无变化' };
      }

      await this.app.vault.modify(file, newContent);
      return { success: true, action: 'content.replace', fileName: file.name, message: '已完成文本替换' };
    } catch (error) {
      return { success: false, action: 'content.replace', fileName: file.name, error: String(error) };
    }
  }

  private async contentInsert(rule: Rule, file: TFile): Promise<ActionResult> {
    const params = rule.target as unknown as ContentInsertParams;
    const { position, content } = params;

    if (!content) {
      return { success: false, action: 'content.insert', fileName: file.name, error: '插入内容未指定' };
    }

    try {
      const originalContent = await this.app.vault.read(file);
      const resolvedContent = this.replaceVariables(content, file);

      let newContent: string;
      if (position === 'start') {
        newContent = resolvedContent + '\n' + originalContent;
      } else if (position === 'end') {
        newContent = originalContent + '\n' + resolvedContent;
      } else if (typeof position === 'number') {
        const lines = originalContent.split('\n');
        const insertIndex = Math.min(Math.max(0, position), lines.length);
        lines.splice(insertIndex, 0, resolvedContent);
        newContent = lines.join('\n');
      } else {
        return { success: false, action: 'content.insert', fileName: file.name, error: `无效的插入位置: ${position}` };
      }

      await this.app.vault.modify(file, newContent);
      return { success: true, action: 'content.insert', fileName: file.name, message: `已在 ${position} 位置插入内容` };
    } catch (error) {
      return { success: false, action: 'content.insert', fileName: file.name, error: String(error) };
    }
  }

  private async contentExtract(rule: Rule, file: TFile): Promise<ActionResult> {
    const params = rule.target as unknown as ContentExtractParams;
    const { pattern, group = 0 } = params;

    if (!pattern) {
      return { success: false, action: 'content.extract', fileName: file.name, error: '提取模式未指定' };
    }

    try {
      const content = await this.app.vault.read(file);
      const resolvedPattern = this.replaceVariables(pattern, file);
      const regex = new RegExp(resolvedPattern);
      const match = content.match(regex);

      if (!match) {
        return { success: false, action: 'content.extract', fileName: file.name, error: '未匹配到内容' };
      }

      const extracted = match[group] || match[0];
      return {
        success: true,
        action: 'content.extract',
        fileName: file.name,
        message: `提取结果: ${extracted}`,
      };
    } catch (error) {
      return { success: false, action: 'content.extract', fileName: file.name, error: String(error) };
    }
  }

  // ============================================================================
  // HTTP 请求实现
  // ============================================================================

  private async httpRequest(rule: Rule, file: TFile): Promise<ActionResult> {
    const params = rule.target as unknown as HttpRequestParams;
    const { method, url, headers = {}, body, timeout = 10000 } = params;

    if (!url) {
      return { success: false, action: 'http.request', fileName: file.name, error: '请求 URL 未指定' };
    }

    try {
      const resolvedUrl = this.replaceVariables(url, file);
      const resolvedBody = body ? this.replaceVariables(JSON.stringify(body), file) : undefined;

      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      };

      if (resolvedBody && ['POST', 'PUT'].includes(method)) {
        options.body = resolvedBody;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      options.signal = controller.signal;

      const response = await fetch(resolvedUrl, options);
      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          action: 'http.request',
          fileName: file.name,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const responseText = await response.text();
      return {
        success: true,
        action: 'http.request',
        fileName: file.name,
        message: `请求成功 (${response.status})`,
      };
    } catch (error) {
      return { success: false, action: 'http.request', fileName: file.name, error: String(error) };
    }
  }

  // ============================================================================
  // AI 请求实现
  // ============================================================================

  private async aiRequest(rule: Rule, file: TFile): Promise<ActionResult> {
    const params = rule.target as unknown as AIRequestParams;
    const { provider, operation, prompt, model, apiKey } = params;

    if (!prompt) {
      return { success: false, action: 'ai.request', fileName: file.name, error: 'AI 提示词未指定' };
    }

    try {
      const resolvedPrompt = this.replaceVariables(prompt, file);
      const content = await this.app.vault.read(file);

      let endpoint = '';
      let requestBody: Record<string, unknown> = {};
      let headers: Record<string, string> = {};

      switch (provider) {
        case 'openai':
          endpoint = 'https://api.openai.com/v1/chat/completions';
          headers = { 'Authorization': `Bearer ${apiKey}` };
          requestBody = {
            model: model || 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: this.getSystemPrompt(operation) },
              { role: 'user', content: `${resolvedPrompt}\n\n文件内容:\n${content.slice(0, 4000)}` }
            ],
          };
          break;
        case 'anthropic':
          endpoint = 'https://api.anthropic.com/v1/messages';
          headers = { 'x-api-key': apiKey || '', 'anthropic-version': '2023-06-01' };
          requestBody = {
            model: model || 'claude-3-sonnet-20240229',
            max_tokens: 1024,
            messages: [
              { role: 'user', content: `${resolvedPrompt}\n\n文件内容:\n${content.slice(0, 4000)}` }
            ],
          };
          break;
        case 'custom':
          // 自定义 provider 需要自行扩展
          return {
            success: false,
            action: 'ai.request',
            fileName: file.name,
            error: '自定义 AI provider 需要额外配置 endpoint',
          };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        return {
          success: false,
          action: 'ai.request',
          fileName: file.name,
          error: `AI 请求失败: ${response.status}`,
        };
      }

      const result = await response.json();
      return {
        success: true,
        action: 'ai.request',
        fileName: file.name,
        message: `${provider} ${operation} 完成`,
      };
    } catch (error) {
      return { success: false, action: 'ai.request', fileName: file.name, error: String(error) };
    }
  }

  private getSystemPrompt(operation: string): string {
    switch (operation) {
      case 'summarize':
        return '请简洁地总结以下文档的主要内容：';
      case 'classify':
        return '请根据内容对文档进行分类：';
      case 'generate':
        return '请根据以下内容生成相应的内容：';
      case 'extract':
        return '请从以下内容中提取关键信息：';
      case 'translate':
        return '请将以下内容翻译成中文：';
      default:
        return '请处理以下内容：';
    }
  }
}
