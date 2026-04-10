// ***************************************************************************************
// * 定时任务调度器
// * 功能：支持 Cron 表达式和固定间隔的任务调度
// ***************************************************************************************

import { App, Notice } from 'obsidian';
import { Rule, RuleSchedule } from '../core/types';
import AutoNoteMover from '../main';

// 任务接口
export interface ScheduledTask {
  ruleId: string;
  ruleName: string;
  schedule: Required<RuleSchedule>;
  lastRun?: number;
  nextRun?: number;
  enabled: boolean;
}

// Cron 解析结果
interface CronResult {
  minutes: number[];
  hours: number[];
  days: number[];
  months: number[];
  weekdays: number[];
}

/**
 * 定时任务调度器
 * 支持两种模式：
 * 1. 固定间隔：每 N 分钟执行一次
 * 2. Cron 表达式：分 时 日 月 周
 */
export class TaskScheduler {
  private app: App;
  private plugin: AutoNoteMover;
  private tasks: Map<string, ScheduledTask> = new Map();
  private intervalId?: number;
  private readonly CHECK_INTERVAL = 60000; // 每分钟检查一次

  constructor(app: App, plugin: AutoNoteMover) {
    this.app = app;
    this.plugin = plugin;
  }

  /**
   * 启动调度器
   */
  start(): void {
    if (this.intervalId) {
      this.stop();
    }

    console.log('[TaskScheduler] 启动，检查间隔:', this.CHECK_INTERVAL, 'ms');
    this.intervalId = window.setInterval(() => {
      this.checkAndExecute();
    }, this.CHECK_INTERVAL);
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = undefined;
      console.log('[TaskScheduler] 已停止');
    }
  }

  /**
   * 注册定时任务
   */
  register(rule: Rule): void {
    if (!rule.schedule || !rule.enabled || rule.triggerMode !== 'scheduled') {
      return;
    }

    const task: ScheduledTask = {
      ruleId: rule.id!,
      ruleName: rule.name,
      schedule: {
        interval: rule.schedule.interval,
        cron: rule.schedule.cron,
      } as Required<RuleSchedule>,
      enabled: true,
    };

    task.nextRun = this.calculateNextRun(task.schedule);
    this.tasks.set(rule.id!, task);

    console.log(`[TaskScheduler] 注册任务: ${rule.name}, 下次执行:`, new Date(task.nextRun!).toLocaleString());
  }

  /**
   * 注销定时任务
   */
  unregister(ruleId: string): void {
    this.tasks.delete(ruleId);
    console.log(`[TaskScheduler] 注销任务: ${ruleId}`);
  }

  /**
   * 更新任务
   */
  update(rule: Rule): void {
    this.unregister(rule.id!);
    this.register(rule);
  }

  /**
   * 检查并执行到期的任务
   */
  private checkAndExecute(): void {
    const now = Date.now();

    for (const [ruleId, task] of this.tasks.entries()) {
      if (!task.enabled || !task.nextRun) continue;

      if (now >= task.nextRun) {
        console.log(`[TaskScheduler] 执行任务: ${task.ruleName}`);
        this.executeTask(task);

        // 计算下次执行时间
        task.lastRun = now;
        task.nextRun = this.calculateNextRun(task.schedule, now);
      }
    }
  }

  /**
   * 执行任务（回调给主插件）
   */
  private async executeTask(task: ScheduledTask): Promise<void> {
    new Notice(`定时任务执行：${task.ruleName}`);
    // 直接调用插件方法执行
    await this.plugin.executeScheduledRule(task.ruleId);
  }

  /**
   * 计算下次执行时间
   */
  private calculateNextRun(schedule: Required<RuleSchedule>, now: number = Date.now()): number {
    if (schedule.cron) {
      return this.parseCron(schedule.cron, now);
    } else if (schedule.interval) {
      return now + schedule.interval * 60 * 1000;
    } else {
      return now + 60 * 60 * 1000; // 默认 1 小时
    }
  }

  /**
   * 解析 Cron 表达式
   * 格式：分 时 日 月 周
   * 示例：0 9 * * 1 (每周一 9 点)
   */
  private parseCron(cron: string, now: number): number {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) {
      console.error('[TaskScheduler] Cron 表达式格式错误:', cron);
      return now + 60 * 60 * 1000;
    }

    const minutes = this.parseCronField(parts[0]!, 0, 59);
    const hours = this.parseCronField(parts[1]!, 0, 23);
    const days = this.parseCronField(parts[2]!, 1, 31);
    const months = this.parseCronField(parts[3]!, 1, 12);
    const weekdays = this.parseCronField(parts[4]!, 0, 6);

    const currentDate = new Date(now);

    // 从下一分钟开始检查
    currentDate.setMinutes(currentDate.getMinutes() + 1);
    currentDate.setSeconds(0);
    currentDate.setMilliseconds(0);

    // 最多查找 366 天（防止死循环）
    for (let i = 0; i < 366 * 24 * 60; i++) {
      const minute = currentDate.getMinutes();
      const hour = currentDate.getHours();
      const day = currentDate.getDate();
      const month = currentDate.getMonth() + 1;
      const weekday = currentDate.getDay();

      if (
        minutes.includes(minute) &&
        hours.includes(hour) &&
        (days.includes(day) || days.length === 31) &&
        (months.includes(month) || months.length === 12) &&
        (weekdays.includes(weekday) || weekdays.length === 7)
      ) {
        return currentDate.getTime();
      }

      currentDate.setMinutes(currentDate.getMinutes() + 1);
    }

    console.error('[TaskScheduler] 未找到匹配的 Cron 时间:', cron);
    return now + 60 * 60 * 1000;
  }

  /**
   * 解析 Cron 字段
   */
  private parseCronField(field: string, min: number, max: number): number[] {
    if (field === '*') {
      return Array.from({ length: max - min + 1 }, (_, i) => i + min);
    }

    const values: number[] = [];
    const parts = field.split(',');

    for (const part of parts) {
      if (part.includes('/')) {
        const [range, step] = part.split('/');
        const stepValue = parseInt(step, 10);
        const [rangeMin, rangeMax] = range === '*' ? [min, max] : range.split('-').map(Number);

        for (let i = rangeMin; i <= rangeMax; i += stepValue) {
          values.push(i);
        }
      } else if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        for (let i = start; i <= end; i++) {
          values.push(i);
        }
      } else {
        values.push(parseInt(part, 10));
      }
    }

    return values;
  }

  /**
   * 获取所有任务
   */
  getTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(ruleId: string): ScheduledTask | undefined {
    return this.tasks.get(ruleId);
  }
}
