import { TFile, CachedMetadata } from 'obsidian';
import AutoNoteMover from '../../main';
import { Rule } from '../../core/types';

export interface TestResult {
  ruleId?: string;
  ruleName: string;
  matchCount: number;
  matchedFiles: string[];
}

export class RuleTestService {
  constructor(private plugin: AutoNoteMover) {}

  async testSingleRule(rule: Rule, showNotice: (message: string) => void): Promise<TestResult> {
    showNotice('正在测试规则...');
    
    const allFiles = this.plugin.getFileService()?.getAllMarkdownFiles() || [];
    let matchCount = 0;
    const matchedFiles: string[] = [];

    for (const file of allFiles) {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      const results = this.plugin.ruleEngine?.evaluateFile(file, cache) || [];
      if (results.some((r: any) => r.matched && r.rule.id === rule.id)) {
        matchCount++;
        matchedFiles.push(file.path);
      }
    }

    const result: TestResult = {
      ruleId: rule.id!,
      ruleName: rule.name || '未命名规则',
      matchCount,
      matchedFiles,
    };

    showNotice(`规则 "${rule.name}" 匹配了 ${matchCount} 个文件`);
    return result;
  }

  async testAllRules(showNotice: (message: string) => void): Promise<TestResult> {
    showNotice('正在测试所有规则...');
    
    const allFiles = this.plugin.getFileService()?.getAllMarkdownFiles() || [];
    let totalMatches = 0;
    const matchedFiles: string[] = [];

    for (const file of allFiles) {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      const results = this.plugin.ruleEngine?.evaluateFile(file, cache) || [];
      if (results.some((r: any) => r.matched)) {
        totalMatches++;
        matchedFiles.push(file.path);
      }
    }

    const result: TestResult = {
      ruleName: '所有规则',
      matchCount: totalMatches,
      matchedFiles,
    };

    showNotice(`规则测试完成，共匹配 ${totalMatches} 个文件`);
    return result;
  }

  getMatchedFiles(rule: Rule): string[] {
    const allFiles = this.plugin.getFileService()?.getAllMarkdownFiles() || [];
    const matchedFiles: string[] = [];

    for (const file of allFiles) {
      const cache = this.plugin.app.metadataCache.getFileCache(file);
      const results = this.plugin.ruleEngine?.evaluateFile(file, cache) || [];
      if (results.some((r: any) => r.matched && r.rule.id === rule.id)) {
        matchedFiles.push(file.path);
      }
    }

    return matchedFiles;
  }
}
