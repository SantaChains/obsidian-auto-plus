import { Setting } from 'obsidian';
import { PluginSettings, ErrorStrategy } from '../../core/types';

export interface GlobalSettingsProps {
  settings: PluginSettings;
  onSettingChange: (key: keyof PluginSettings, value: any) => Promise<void>;
}

export class GlobalSettingsComponent {
  private element: HTMLElement;
  private props: GlobalSettingsProps;

  constructor(container: HTMLElement, props: GlobalSettingsProps) {
    this.props = props;
    this.element = this.render(container);
  }

  private render(container: HTMLElement): HTMLElement {
    this.renderBasicSettings(container);
    this.addDivider(container);
    this.renderFileOperationSettings(container);
    this.addDivider(container);
    this.renderExecutionSettings(container);
    this.addDivider(container);
    this.renderAdvancedFeatures(container);
    this.addDivider(container);
    this.renderErrorHandlingSettings(container);
    this.addDivider(container);
    this.renderLogSettings(container);
    return container;
  }

  private addDivider(container: HTMLElement): void {
    const divider = container.createDiv();
    divider.addClass('auto-plus-divider');
  }

  private renderBasicSettings(container: HTMLElement): void {
    const section = container.createDiv();
    section.addClass('auto-plus-settings-section');

    new Setting(section).setName('基础设置').setHeading();

    this.addTriggerModeSetting(section);
    this.addExecutionPolicySetting(section);
    this.addRegexForTagsSetting(section);
    this.addNotificationsSetting(section);
    this.addStatusBarIndicatorSetting(section);
  }

  private renderFileOperationSettings(container: HTMLElement): void {
    const section = container.createDiv();
    section.addClass('auto-plus-settings-section');

    new Setting(section).setName('文件操作').setHeading();

    this.addDeleteModeSetting(section);
    this.addSafeModeSetting(section);
  }

  private renderExecutionSettings(container: HTMLElement): void {
    const section = container.createDiv();
    section.addClass('auto-plus-settings-section');

    new Setting(section).setName('执行控制').setHeading();

    this.addConcurrentModeSetting(section);
    this.addMaxConcurrentRulesSetting(section);
    this.addStartupRunSetting(section);
  }

  private renderAdvancedFeatures(container: HTMLElement): void {
    const section = container.createDiv();
    section.addClass('auto-plus-settings-section');

    new Setting(section).setName('高级功能').setHeading();

    this.addAIEnabledSetting(section);
    this.addHTTPEnabledSetting(section);
    this.addMCPEnabledSetting(section);
    this.addDryRunEnabledSetting(section);
    this.addBatchProgressEnabledSetting(section);
  }

  private renderErrorHandlingSettings(container: HTMLElement): void {
    const section = container.createDiv();
    section.addClass('auto-plus-settings-section');

    new Setting(section).setName('错误处理').setHeading();

    this.addErrorStrategySetting(section);
  }

  private renderLogSettings(container: HTMLElement): void {
    const section = container.createDiv();
    section.addClass('auto-plus-settings-section');

    new Setting(section).setName('日志').setHeading();

    this.addLogEnabledSetting(section);
    this.addLogRetentionSetting(section);
  }

  private addTriggerModeSetting(container: HTMLElement): void {
    new Setting(container)
      .setName('触发模式')
      .setDesc('自动：保存时触发 | 手动：通过命令触发')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('auto', '自动')
          .addOption('manual', '手动')
          .setValue(this.props.settings.triggerMode)
          .onChange(async (value: string) => {
            await this.props.onSettingChange('triggerMode', value as 'auto' | 'manual');
          });
      });
  }

  private addExecutionPolicySetting(container: HTMLElement): void {
    new Setting(container)
      .setName('执行策略')
      .setDesc('多个规则匹配时的处理方式')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('first', '仅执行第一个匹配的规则')
          .addOption('all', '执行所有匹配的规则')
          .setValue(this.props.settings.allowMultipleActions ? 'all' : 'first')
          .onChange(async (value: string) => {
            await this.props.onSettingChange('allowMultipleActions', value === 'all');
          });
      });
  }

  private addRegexForTagsSetting(container: HTMLElement): void {
    new Setting(container)
      .setName('标签匹配使用正则')
      .setDesc('启用后标签条件将作为正则表达式匹配')
      .addToggle((toggle) => {
        toggle.setValue(this.props.settings.useRegexForTags).onChange(async (value) => {
          await this.props.onSettingChange('useRegexForTags', value);
        });
      });
  }

  private addNotificationsSetting(container: HTMLElement): void {
    new Setting(container)
      .setName('显示操作通知')
      .setDesc('执行规则后显示通知提示')
      .addToggle((toggle) => {
        toggle.setValue(this.props.settings.showNotifications).onChange(async (value) => {
          await this.props.onSettingChange('showNotifications', value);
        });
      });
  }

  private addStatusBarIndicatorSetting(container: HTMLElement): void {
    new Setting(container)
      .setName('状态栏显示')
      .setDesc('在状态栏显示当前触发模式')
      .addToggle((toggle) => {
        toggle.setValue(this.props.settings.statusBarIndicator).onChange(async (value) => {
          await this.props.onSettingChange('statusBarIndicator', value);
        });
      });
  }

  private addDeleteModeSetting(container: HTMLElement): void {
    new Setting(container)
      .setName('文件删除方式')
      .setDesc('永久删除将无法恢复，移至回收站可从系统恢复')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('trash', '移至回收站（推荐）')
          .addOption('permanent', '永久删除')
          .setValue(this.props.settings.deleteMode)
          .onChange(async (value: string) => {
            await this.props.onSettingChange('deleteMode', value as 'permanent' | 'trash');
          });
      });
  }

  private addSafeModeSetting(container: HTMLElement): void {
    new Setting(container)
      .setName('安全模式')
      .setDesc('启用后文件操作前自动创建备份')
      .addToggle((toggle) => {
        toggle.setValue(this.props.settings.safeMode).onChange(async (value) => {
          await this.props.onSettingChange('safeMode', value);
        });
      });
  }

  private addConcurrentModeSetting(container: HTMLElement): void {
    new Setting(container)
      .setName('并发执行模式')
      .setDesc('顺序：逐个执行规则 | 并行：同时执行多个规则')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('sequential', '顺序执行')
          .addOption('parallel', '并行执行')
          .setValue(this.props.settings.concurrentMode)
          .onChange(async (value: string) => {
            await this.props.onSettingChange('concurrentMode', value as 'sequential' | 'parallel');
          });
      });
  }

  private addMaxConcurrentRulesSetting(container: HTMLElement): void {
    new Setting(container)
      .setName('最大并发规则数')
      .setDesc('并行执行时的最大同时运行规则数量')
      .addSlider((slider) => {
        slider
          .setLimits(1, 10, 1)
          .setValue(this.props.settings.maxConcurrentRules)
          .setDynamicTooltip()
          .onChange(async (value: number) => {
            await this.props.onSettingChange('maxConcurrentRules', value);
          });
      });
  }

  private addStartupRunSetting(container: HTMLElement): void {
    new Setting(container)
      .setName('启动时运行')
      .setDesc('Obsidian 启动时自动执行所有已启用的定时规则')
      .addToggle((toggle) => {
        toggle.setValue(this.props.settings.startupRunEnabled).onChange(async (value) => {
          await this.props.onSettingChange('startupRunEnabled', value);
        });
      });
  }

  private addAIEnabledSetting(container: HTMLElement): void {
    new Setting(container)
      .setName('AI 集成')
      .setDesc('启用 AI 请求功能（需要配置 API Key）')
      .addToggle((toggle) => {
        toggle.setValue(this.props.settings.aiEnabled).onChange(async (value) => {
          await this.props.onSettingChange('aiEnabled', value);
        });
      });
  }

  private addHTTPEnabledSetting(container: HTMLElement): void {
    new Setting(container)
      .setName('HTTP 请求')
      .setDesc('启用发送 HTTP 请求功能，可与外部服务集成')
      .addToggle((toggle) => {
        toggle.setValue(this.props.settings.httpEnabled).onChange(async (value) => {
          await this.props.onSettingChange('httpEnabled', value);
        });
      });
  }

  private addMCPEnabledSetting(container: HTMLElement): void {
    new Setting(container)
      .setName('MCP 协议')
      .setDesc('启用 MCP Server，将插件工具暴露给 AI Agent')
      .addToggle((toggle) => {
        toggle.setValue(this.props.settings.mcpEnabled).onChange(async (value) => {
          await this.props.onSettingChange('mcpEnabled', value);
        });
      });
  }

  private addDryRunEnabledSetting(container: HTMLElement): void {
    new Setting(container)
      .setName('Dry Run 模拟')
      .setDesc('执行前先模拟运行，预览所有操作结果')
      .addToggle((toggle) => {
        toggle.setValue(this.props.settings.dryRunEnabled).onChange(async (value) => {
          await this.props.onSettingChange('dryRunEnabled', value);
        });
      });
  }

  private addBatchProgressEnabledSetting(container: HTMLElement): void {
    new Setting(container)
      .setName('批量进度显示')
      .setDesc('批量操作时显示进度对话框')
      .addToggle((toggle) => {
        toggle.setValue(this.props.settings.batchProgressEnabled).onChange(async (value) => {
          await this.props.onSettingChange('batchProgressEnabled', value);
        });
      });
  }

  private addErrorStrategySetting(container: HTMLElement): void {
    new Setting(container)
      .setName('默认错误策略')
      .setDesc('执行失败时的处理方式')
      .addDropdown((dropDown) => {
        dropDown
          .addOption('stop', '立即停止')
          .addOption('retry', '自动重试3次')
          .addOption('skip', '跳过并继续')
          .addOption('rollback', '回滚所有操作')
          .setValue(this.props.settings.defaultErrorStrategy)
          .onChange(async (value: string) => {
            await this.props.onSettingChange('defaultErrorStrategy', value as ErrorStrategy);
          });
      });
  }

  private addLogEnabledSetting(container: HTMLElement): void {
    new Setting(container)
      .setName('启用日志')
      .setDesc('记录规则执行历史和操作详情')
      .addToggle((toggle) => {
        toggle.setValue(this.props.settings.logEnabled).onChange(async (value) => {
          await this.props.onSettingChange('logEnabled', value);
        });
      });
  }

  private addLogRetentionSetting(container: HTMLElement): void {
    new Setting(container)
      .setName('日志保留天数')
      .setDesc('日志文件保留的天数')
      .addSlider((slider) => {
        slider
          .setLimits(7, 90, 1)
          .setValue(this.props.settings.logRetention.maxDays)
          .setDynamicTooltip()
          .onChange(async (value: number) => {
            await this.props.onSettingChange('logRetention', {
              ...this.props.settings.logRetention,
              maxDays: value,
            });
          });
      });
  }

  destroy(): void {
    this.element.remove();
  }
}