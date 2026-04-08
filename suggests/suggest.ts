// ***************************************************************************************
// * Suggest 组件 - 适配 Obsidian 2026 API
// ***************************************************************************************

import { App, ISuggestOwner, Scope, prepareFuzzySearch, FuzzyMatch, TFolder, TFile, getAllTags } from 'obsidian';

export const wrapAround = (value: number, size: number): number => {
	return ((value % size) + size) % size;
};

export function fuzzyFilter<T>(
	items: T[],
	query: string,
	extractFn: (item: T) => string
): FuzzyMatch<T>[] {
	if (!query || query.trim() === '') {
		return items.map(item => ({ item, match: { score: 0, matches: [] } }));
	}

	const fuzzy = prepareFuzzySearch(query);
	const results: FuzzyMatch<T>[] = [];

	for (const item of items) {
		const match = fuzzy(extractFn(item));
		if (match) {
			results.push({ item, match });
		}
	}

	return results.sort((a, b) => b.match.score - a.match.score);
}

class Suggest<T> {
	private owner: ISuggestOwner<T>;
	private values: T[] = [];
	private suggestions: HTMLDivElement[] = [];
	private selectedItem: number = 0;
	private containerEl: HTMLElement;

	constructor(owner: ISuggestOwner<T>, containerEl: HTMLElement, scope: Scope) {
		this.owner = owner;
		this.containerEl = containerEl;

		containerEl.on('click', '.suggestion-item', (event: MouseEvent, el: HTMLElement) => {
			event.preventDefault();
			const item = this.suggestions.indexOf(el as HTMLDivElement);
			if (item >= 0) {
				this.setSelectedItem(item, false);
				this.useSelectedItem(event);
			}
		});

		containerEl.on('mousemove', '.suggestion-item', (_event: MouseEvent, el: HTMLElement) => {
			const item = this.suggestions.indexOf(el as HTMLDivElement);
			if (item >= 0) {
				this.setSelectedItem(item, false);
			}
		});

		scope.register([], 'ArrowUp', (event) => {
			if (!event.isComposing) {
				this.setSelectedItem(this.selectedItem - 1, true);
				return false;
			}
			return true;
		});

		scope.register([], 'ArrowDown', (event) => {
			if (!event.isComposing) {
				this.setSelectedItem(this.selectedItem + 1, true);
				return false;
			}
			return true;
		});

		scope.register([], 'Enter', (event) => {
			if (!event.isComposing) {
				this.useSelectedItem(event);
				return false;
			}
			return true;
		});

		scope.register([], 'Tab', (event) => {
			if (!event.isComposing && this.values.length > 0) {
				this.useSelectedItem(event);
				return false;
			}
			return true;
		});
	}

	setSuggestions(values: T[]): void {
		this.containerEl.empty();
		this.suggestions = [];

		if (values.length === 0) {
			this.values = [];
			this.selectedItem = 0;
			return;
		}

		for (const value of values) {
			const suggestionEl = this.containerEl.createDiv('suggestion-item');
			this.owner.renderSuggestion(value, suggestionEl);
			this.suggestions.push(suggestionEl);
		}

		this.values = values;
		this.setSelectedItem(0, false);
	}

	useSelectedItem(event: MouseEvent | KeyboardEvent): void {
		const currentValue = this.values[this.selectedItem];
		if (currentValue) {
			this.owner.selectSuggestion(currentValue, event);
		}
	}

	setSelectedItem(selectedIndex: number, scrollIntoView: boolean): void {
		if (this.suggestions.length === 0) return;

		const normalizedIndex = wrapAround(selectedIndex, this.suggestions.length);
		const prevSelected = this.suggestions[this.selectedItem];
		const selected = this.suggestions[normalizedIndex];

		prevSelected?.removeClass('is-selected');
		selected?.addClass('is-selected');

		this.selectedItem = normalizedIndex;

		if (scrollIntoView && selected) {
			selected.scrollIntoView({ block: 'nearest' });
		}
	}

	getSelectedItem(): T | null {
		return this.values[this.selectedItem] ?? null;
	}

	empty(): void {
		this.containerEl.empty();
		this.values = [];
		this.suggestions = [];
		this.selectedItem = 0;
	}
}

export abstract class TextInputSuggest<T> implements ISuggestOwner<T> {
	protected app: App;
	protected inputEl: HTMLInputElement;

	private scope: Scope;
	private suggestEl: HTMLElement;
	private suggest: Suggest<T>;
	private isOpen: boolean = false;

	private debounceTimer: number | null = null;
	private readonly debounceMs: number = 50;

	constructor(app: App, inputEl: HTMLInputElement) {
		this.app = app;
		this.inputEl = inputEl;
		this.scope = new Scope();

		this.suggestEl = createDiv('suggestion-container');
		this.suggestEl.addClass('auto-plus-suggest');
		const suggestion = this.suggestEl.createDiv('suggestion');
		this.suggest = new Suggest(this, suggestion, this.scope);

		this.scope.register([], 'Escape', () => {
			this.close();
			this.inputEl.blur();
			return false;
		});

		this.inputEl.addEventListener('input', () => {
			this.debounceUpdate();
		});

		this.inputEl.addEventListener('focus', () => {
			this.debounceUpdate();
		});

		this.inputEl.addEventListener('blur', () => {
			window.setTimeout(() => this.close(), 150);
		});

		this.suggestEl.addEventListener('mousedown', (event: MouseEvent) => {
			event.preventDefault();
		});
	}

	private debounceUpdate(): void {
		if (this.debounceTimer) {
			window.clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = window.setTimeout(() => {
			this.onInputChanged();
		}, this.debounceMs);
	}

	private onInputChanged(): void {
		const inputStr = this.inputEl.value;
		const suggestions = this.getSuggestions(inputStr);

		if (suggestions.length > 0) {
			this.suggest.setSuggestions(suggestions);
			this.open();
		} else {
			this.close();
		}
	}

	private open(): void {
		if (this.isOpen) return;

		(this.app.keymap as any).pushScope(this.scope);

		const rect = this.inputEl.getBoundingClientRect();
		this.suggestEl.addClass('auto-plus-suggest');
		this.suggestEl.style.top = `${rect.bottom + 4}px`;
		this.suggestEl.style.left = `${rect.left}px`;
		this.suggestEl.style.minWidth = `${rect.width}px`;
		this.suggestEl.style.maxWidth = `${Math.max(rect.width, 400)}px`;

		document.body.appendChild(this.suggestEl);
		this.isOpen = true;
	}

	close(): void {
		if (!this.isOpen) return;

		(this.app.keymap as any).popScope(this.scope);
		this.suggest.empty();
		this.suggestEl.detach();
		this.isOpen = false;
	}

	isOpened(): boolean {
		return this.isOpen;
	}

	abstract getSuggestions(inputStr: string): T[];
	abstract renderSuggestion(item: T, el: HTMLElement): void;
	abstract selectSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;
}

// ***************************************************************************************
// * FolderSuggest - 文件夹建议组件
// ***************************************************************************************

export class FolderSuggest extends TextInputSuggest<TFolder> {
	private folderCache: TFolder[] | null = null;
	private cacheTimestamp: number = 0;
	private readonly cacheTTL: number = 5000;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
	}

	private getAllFolders(): TFolder[] {
		const now = Date.now();
		if (this.folderCache && (now - this.cacheTimestamp) < this.cacheTTL) {
			return this.folderCache;
		}

		const abstractFiles = this.app.vault.getAllLoadedFiles();
		const folders: TFolder[] = [];

		for (const file of abstractFiles) {
			if (file instanceof TFolder) {
				folders.push(file);
			}
		}

		folders.sort((a, b) => a.path.localeCompare(b.path));

		this.folderCache = folders;
		this.cacheTimestamp = now;
		return folders;
	}

	getSuggestions(inputStr: string): TFolder[] {
		const folders = this.getAllFolders();
		const maxSuggestions = 50;

		if (!inputStr || inputStr.trim() === '') {
			return folders.slice(0, maxSuggestions);
		}

		const matches = fuzzyFilter(folders, inputStr, folder => folder.path);
		return matches.slice(0, maxSuggestions).map(m => m.item);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		const path = folder.path || '/';
		const container = el.createDiv('suggestion-file-item');

		const icon = container.createSpan('suggestion-file-icon');
		icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';

		const text = container.createSpan('suggestion-file-text');
		text.setText(path);

		if (path === '/' || path === '') {
			el.addClass('suggestion-root');
		}
	}

	selectSuggestion(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
		const path = folder.path || '';
		this.inputEl.value = path;
		this.inputEl.trigger('input');
		this.close();
	}
}

// ***************************************************************************************
// * TagSuggest - 标签建议组件
// ***************************************************************************************

interface TagInfo {
	name: string;
	count: number;
}

export class TagSuggest extends TextInputSuggest<TagInfo> {
	private tagCache: TagInfo[] | null = null;
	private cacheTimestamp: number = 0;
	private readonly cacheTTL: number = 3000;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
	}

	private getAllTagsInfo(): TagInfo[] {
		const now = Date.now();
		if (this.tagCache && (now - this.cacheTimestamp) < this.cacheTTL) {
			return this.tagCache;
		}

		const tagMap = new Map<string, TagInfo>();
		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache) continue;

			const tags = getAllTags(cache);
			if (!tags) continue;

			for (const tag of tags) {
				const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;
				const existing = tagMap.get(normalizedTag);
				if (existing) {
					existing.count++;
				} else {
					tagMap.set(normalizedTag, { name: normalizedTag, count: 1 });
				}
			}
		}

		this.tagCache = Array.from(tagMap.values());
		this.cacheTimestamp = now;
		return this.tagCache;
	}

	getSuggestions(inputStr: string): TagInfo[] {
		let tags = this.getAllTagsInfo();
		const maxSuggestions = 30;

		if (!inputStr || inputStr.trim() === '') {
			return tags.sort((a, b) => b.count - a.count).slice(0, maxSuggestions);
		}

		const normalizedInput = inputStr.startsWith('#') ? inputStr : `#${inputStr}`;
		const matches = fuzzyFilter(tags, normalizedInput, tag => tag.name);

		return matches.slice(0, maxSuggestions).map(m => m.item);
	}

	renderSuggestion(tagInfo: TagInfo, el: HTMLElement): void {
		const container = el.createDiv('suggestion-tag-item');

		const leftSection = container.createDiv('suggestion-tag-left');

		const icon = leftSection.createSpan('suggestion-tag-icon');
		icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>';

		const name = leftSection.createSpan('suggestion-tag-name');
		name.setText(tagInfo.name);

		const count = container.createSpan('suggestion-tag-count');
		count.setText(`${tagInfo.count}`);
	}

	selectSuggestion(tagInfo: TagInfo, evt: MouseEvent | KeyboardEvent): void {
		this.inputEl.value = tagInfo.name;
		this.inputEl.trigger('input');
		this.close();
	}
}
