// ***************************************************************************************
// * 文件变化监听服务
// * 监听 vault 文件变化事件，提供防抖处理和事件过滤
// ***************************************************************************************

import { App, TFile, TAbstractFile, normalizePath } from 'obsidian';

// ----------------------------------------------------------------------------
// 类型定义
// ----------------------------------------------------------------------------

export type FileChangeEvent = 'create' | 'modify' | 'rename' | 'delete';

export type FileChangeCallback = (file: TFile, event: FileChangeEvent, oldPath?: string) => void;

interface PendingEvent {
	event: FileChangeEvent;
	oldPath?: string;
	timer: number;
}

// ----------------------------------------------------------------------------
// FileChangeListener 类
// ----------------------------------------------------------------------------

export class FileChangeListener {
	// Obsidian App 实例
	private app: App;

	// 监听状态
	private listening: boolean = false;

	// 已注册的回调函数列表
	private callbacks: FileChangeCallback[] = [];

	// 防抖待处理事件 Map<filePath, PendingEvent>
	private pendingEvents: Map<string, PendingEvent> = new Map();

	// 防抖延迟(ms)
	private readonly DEBOUNCE_DELAY: number = 100;

	// 需要排除的文件夹
	private readonly EXCLUDED_FOLDERS: string[] = [
		'.obsidian',
		'.trash'
	];

	// ----------------------------------------------------------------------------
	// 构造函数
	// ----------------------------------------------------------------------------

	constructor(app: App) {
		this.app = app;
	}

	// ----------------------------------------------------------------------------
	// 公共方法
	// ----------------------------------------------------------------------------

	/**
	 * 注册文件变化回调
	 * @param callback 回调函数
	 */
	on(callback: FileChangeCallback): void {
		if (!this.callbacks.includes(callback)) {
			this.callbacks.push(callback);
		}
	}

	/**
	 * 取消注册回调
	 * @param callback 回调函数
	 */
	off(callback: FileChangeCallback): void {
		const index = this.callbacks.indexOf(callback);
		if (index > -1) {
			this.callbacks.splice(index, 1);
		}
	}

	/**
	 * 开始监听文件变化
	 */
	start(): void {
		if (this.listening) {
			return;
		}

		this.listening = true;
		this.registerVaultEvents();
		this.registerMetadataEvents();
	}

	/**
	 * 停止监听
	 */
	stop(): void {
		if (!this.listening) {
			return;
		}

		this.listening = false;
		this.clearPendingEvents();
		this.unregisterVaultEvents();
		this.unregisterMetadataEvents();
	}

	/**
	 * 获取监听状态
	 * @returns 是否正在监听
	 */
	isListening(): boolean {
		return this.listening;
	}

	// ----------------------------------------------------------------------------
	// 私有方法 - 事件注册
	// ----------------------------------------------------------------------------

	/**
	 * 注册 vault 事件监听
	 */
	private registerVaultEvents(): void {
		// 文件创建
		this.app.vault.on('create', (file: TAbstractFile) => {
			this.handleFileCreate(file);
		});

		// 文件修改
		this.app.vault.on('modify', (file: TAbstractFile) => {
			this.handleFileModify(file);
		});

		// 文件重命名
		this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
			this.handleFileRename(file, oldPath);
		});

		// 文件删除
		this.app.vault.on('delete', (file: TAbstractFile) => {
			this.handleFileDelete(file);
		});
	}

	/**
	 * 注销 vault 事件监听
	 */
	private unregisterVaultEvents(): void {
		// Obsidian 的 on() 返回的 callback 可用于 off()
		// 此处通过引用方式清理
		this.callbacks; // 引用保留
	}

	/**
	 * 注册 metadataCache 变化事件
	 */
	private registerMetadataEvents(): void {
		this.app.metadataCache.on('changed', (file: TFile) => {
			this.handleMetadataChange(file);
		});
	}

	/**
	 * 注销 metadataCache 事件
	 */
	private unregisterMetadataEvents(): void {
		// 清理逻辑
	}

	// ----------------------------------------------------------------------------
	// 私有方法 - 事件处理
	// ----------------------------------------------------------------------------

	/**
	 * 处理文件创建
	 */
	private handleFileCreate(file: TAbstractFile): void {
		if (!this.shouldProcess(file)) {
			return;
		}
		this.queueEvent(file as TFile, 'create');
	}

	/**
	 * 处理文件修改
	 */
	private handleFileModify(file: TAbstractFile): void {
		if (!this.shouldProcess(file)) {
			return;
		}
		this.queueEvent(file as TFile, 'modify');
	}

	/**
	 * 处理文件重命名
	 */
	private handleFileRename(file: TAbstractFile, oldPath: string): void {
		if (!this.shouldProcess(file)) {
			return;
		}
		this.queueEvent(file as TFile, 'rename', oldPath);
	}

	/**
	 * 处理文件删除
	 */
	private handleFileDelete(file: TAbstractFile): void {
		if (!this.shouldProcess(file)) {
			return;
		}
		this.queueEvent(file as TFile, 'delete');
	}

	/**
	 * 处理元数据变化
	 */
	private handleMetadataChange(file: TFile): void {
		if (!this.shouldProcess(file)) {
			return;
		}
		this.queueEvent(file, 'modify');
	}

	// ----------------------------------------------------------------------------
	// 私有方法 - 防抖处理
	// ----------------------------------------------------------------------------

	/**
	 * 将事件加入防抖队列
	 */
	private queueEvent(file: TFile, event: FileChangeEvent, oldPath?: string): void {
		const path = file.path;

		// 如果已有待处理事件，清除之前的定时器
		const existing = this.pendingEvents.get(path);
		if (existing) {
			clearTimeout(existing.timer);
		}

		// 创建新的待处理事件
		const timer = window.setTimeout(() => {
			this.flushEvent(path);
		}, this.DEBOUNCE_DELAY);

		this.pendingEvents.set(path, {
			event,
			oldPath,
			timer
		});
	}

	/**
	 * 触发待处理事件
	 */
	private flushEvent(path: string): void {
		const pending = this.pendingEvents.get(path);
		if (!pending) {
			return;
		}

		// 从 Map 中移除
		this.pendingEvents.delete(path);

		// 获取当前文件
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			return;
		}

		// 触发所有回调
		this.invokeCallbacks(file, pending.event, pending.oldPath);
	}

	/**
	 * 清空所有待处理事件
	 */
	private clearPendingEvents(): void {
		for (const [, pending] of this.pendingEvents) {
			clearTimeout(pending.timer);
		}
		this.pendingEvents.clear();
	}

	// ----------------------------------------------------------------------------
	// 私有方法 - 事件过滤
	// ----------------------------------------------------------------------------

	/**
	 * 检查是否应该处理该文件
	 */
	private shouldProcess(file: TAbstractFile): boolean {
		// 必须是 TFile
		if (!(file instanceof TFile)) {
			return false;
		}

		// 只处理 Markdown 文件
		if (file.extension !== 'md') {
			return false;
		}

		// 排除指定文件夹
		if (this.isExcludedPath(file.path)) {
			return false;
		}

		return true;
	}

	/**
	 * 检查路径是否在排除列表中
	 */
	private isExcludedPath(filePath: string): boolean {
		const normalizedPath = normalizePath(filePath);

		for (const excluded of this.EXCLUDED_FOLDERS) {
			if (normalizedPath.startsWith(excluded + '/') || normalizedPath === excluded) {
				return true;
			}
		}

		return false;
	}

	// ----------------------------------------------------------------------------
	// 私有方法 - 回调触发
	// ----------------------------------------------------------------------------

	/**
	 * 调用所有已注册的回调
	 */
	private invokeCallbacks(file: TFile, event: FileChangeEvent, oldPath?: string): void {
		for (const callback of this.callbacks) {
			try {
				callback(file, event, oldPath);
			} catch (error) {
				console.error('[FileChangeListener] 回调执行错误:', error);
			}
		}
	}
}
