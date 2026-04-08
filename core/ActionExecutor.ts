// ***************************************************************************************
// * 操作执行器 v2.0
// * 负责执行文件操作（移动、复制、删除、重命名）
// * 支持新的目标配置：destinationFolder + targetFileName 分离
// ***************************************************************************************

import { App, Notice, TFile, TFolder, normalizePath } from 'obsidian';
import { Rule, ActionContext, ActionType } from './types';

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

    switch (rule.action) {
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
}
