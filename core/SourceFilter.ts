// ***************************************************************************************
// * SourceFilter 白名单优先对象筛选器 v1.0
// * 处理流程: Include → Exclude → Match
// ***************************************************************************************

import { App, TFile, CachedMetadata } from 'obsidian';
import { SourceFilter as SourceFilterConfig, SourceItem, YamlValue } from './types';

// ============================================================================
// 类型定义
// ============================================================================

export interface SourceFilterResult {
  files: TFile[];
  excludedCount: number;
  includedCount: number;
}

// ============================================================================
// SourceFilter 筛选器类
// ============================================================================

export class SourceFilter {
  private source: SourceFilterConfig;
  private app: App;

  constructor(source: SourceFilterConfig, app: App) {
    this.source = source;
    this.app = app;
  }

  /**
   * 执行筛选: Include → Exclude → Match
   */
  async execute(): Promise<SourceFilterResult> {
    // 1. 获取所有 Include 文件
    const includeFiles = await this.getIncludeFiles();
    const includedCount = includeFiles.length;

    // 2. 获取需要 Exclude 的文件
    const excludeFiles = await this.getExcludeFiles(includeFiles);

    // 3. 从 Include 中排除 Exclude 文件
    const excludeSet = new Set(excludeFiles.map(f => f.path));
    const matchedFiles = includeFiles.filter(f => !excludeSet.has(f.path));

    return {
      files: matchedFiles,
      excludedCount: excludeFiles.length,
      includedCount,
    };
  }

  /**
   * 获取 Include 匹配的文件
   */
  private async getIncludeFiles(): Promise<TFile[]> {
    const allFiles = this.app.vault.getFiles();
    if (this.source.include.length === 0) {
      return [...allFiles];
    }

    const matchedFiles = new Set<string>();

    for (const item of this.source.include) {
      const files = await this.matchItem(allFiles, item);
      for (const file of files) {
        matchedFiles.add(file.path);
      }
    }

    return Array.from(matchedFiles).map(path =>
      allFiles.find(f => f.path === path)!
    ).filter(Boolean);
  }

  /**
   * 获取需要 Exclude 的文件
   */
  private async getExcludeFiles(allFiles: TFile[]): Promise<TFile[]> {
    if (this.source.exclude.length === 0) {
      return [];
    }

    const excludedFiles = new Set<string>();

    for (const item of this.source.exclude) {
      const files = await this.matchItem(allFiles, item);
      for (const file of files) {
        excludedFiles.add(file.path);
      }
    }

    return Array.from(excludedFiles).map(path =>
      allFiles.find(f => f.path === path)!
    ).filter(Boolean);
  }

  /**
   * 根据 SourceItem 类型匹配文件
   */
  private async matchItem(files: TFile[], item: SourceItem): Promise<TFile[]> {
    switch (item.type) {
      case 'file':
        return this.matchByFile(files, item.path!);
      case 'folder':
        return this.matchByFolder(files, item.path!);
      case 'yaml':
        return this.matchByYaml(files, item.yaml!);
      case 'metadata':
        return this.matchByMetadata(files, item.metadata!);
      default:
        return [];
    }
  }

  /**
   * 文件类型: 精确路径匹配
   */
  private matchByFile(files: TFile[], path: string): TFile[] {
    return files.filter(file => file.path === path);
  }

  /**
   * 文件夹类型: 递归匹配（含子文件夹）
   */
  private matchByFolder(files: TFile[], folder: string): TFile[] {
    // 标准化文件夹路径
    const normalizedFolder = folder.endsWith('/') ? folder : `${folder}/`;
    return files.filter(file => file.path.startsWith(normalizedFolder));
  }

  /**
   * YAML 类型: 基于属性条件
   */
  private matchByYaml(
    files: TFile[],
    yaml: { key: string; operator: string; value: YamlValue }
  ): TFile[] {
    return files.filter(file => this.matchFileByYaml(file, yaml));
  }

  /**
   * 元数据类型: 基于 ctime/mtime
   */
  private matchByMetadata(
    files: TFile[],
    metadata: { field: 'ctime' | 'mtime'; operator: string; value: string }
  ): TFile[] {
    return files.filter(file => this.matchFileByMetadata(file, metadata));
  }

  /**
   * 匹配单个文件 - YAML 条件
   */
  private matchFileByYaml(
    file: TFile,
    yaml: { key: string; operator: string; value: YamlValue }
  ): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache?.frontmatter) {
      return false;
    }

    const frontmatter = cache.frontmatter;
    const key = yaml.key;
    const fileValue = frontmatter[key];
    const targetValue = yaml.value;

    return this.evaluateOperator(fileValue, yaml.operator, targetValue);
  }

  /**
   * 匹配单个文件 - 元数据条件
   */
  private matchFileByMetadata(
    file: TFile,
    metadata: { field: 'ctime' | 'mtime'; operator: string; value: string }
  ): boolean {
    const stat = file.stat;
    const fileTime = metadata.field === 'ctime' ? stat.ctime : stat.mtime;
    const targetTime = new Date(metadata.value).getTime();

    return this.evaluateOperator(fileTime, metadata.operator, targetTime);
  }

  /**
   * 操作符评估
   */
  private evaluateOperator(
    fileValue: unknown,
    operator: string,
    targetValue: YamlValue
  ): boolean {
    switch (operator) {
      case 'equals':
        return fileValue === targetValue;

      case 'notEquals':
        return fileValue !== targetValue;

      case 'exists':
        return fileValue !== undefined && fileValue !== null;

      case 'notExists':
        return fileValue === undefined || fileValue === null;

      case 'contains':
        if (typeof fileValue === 'string') {
          return fileValue.includes(String(targetValue));
        }
        if (Array.isArray(fileValue)) {
          return fileValue.includes(targetValue);
        }
        return false;

      case 'startsWith':
        return typeof fileValue === 'string' && fileValue.startsWith(String(targetValue));

      case 'endsWith':
        return typeof fileValue === 'string' && fileValue.endsWith(String(targetValue));

      case 'matches':
        try {
          const regex = new RegExp(String(targetValue));
          return typeof fileValue === 'string' && regex.test(fileValue);
        } catch {
          return false;
        }

      case 'gt':
        return Number(fileValue) > Number(targetValue);

      case 'gte':
        return Number(fileValue) >= Number(targetValue);

      case 'lt':
        return Number(fileValue) < Number(targetValue);

      case 'lte':
        return Number(fileValue) <= Number(targetValue);

      case 'arrayContains':
        if (Array.isArray(fileValue)) {
          return fileValue.includes(targetValue);
        }
        return false;

      case 'arrayNotContains':
        if (Array.isArray(fileValue)) {
          return !fileValue.includes(targetValue);
        }
        return true;

      case 'arrayHasAny':
        if (Array.isArray(fileValue) && Array.isArray(targetValue)) {
          return targetValue.some(v => fileValue.includes(v));
        }
        return false;

      case 'arrayHasAll':
        if (Array.isArray(fileValue) && Array.isArray(targetValue)) {
          return targetValue.every(v => fileValue.includes(v));
        }
        return false;

      default:
        return false;
    }
  }
}
