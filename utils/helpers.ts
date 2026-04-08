// ***************************************************************************************
// * 工具函数
// * 纯工具函数，无业务逻辑
// ***************************************************************************************

import { CachedMetadata, parseFrontMatterEntry } from 'obsidian';

export const isFmDisable = (fileCache: CachedMetadata | null): boolean => {
	if (!fileCache?.frontmatter) return false;
	const fm = parseFrontMatterEntry(fileCache.frontmatter, 'AutoNoteMover');
	return fm === 'disable';
};

export const getTriggerIndicator = (trigger: string): string => {
	return trigger === '自动' ? '[A]' : '[M]';
};

export const arrayMove = <T>(array: T[], fromIndex: number, toIndex: number): void => {
	if (toIndex < 0 || toIndex >= array.length) return;
	const [element] = array.splice(fromIndex, 1);
	array.splice(toIndex, 0, element);
};
