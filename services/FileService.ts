// ***************************************************************************************
// * 文件服务
// * 封装文件系统操作，提供高级文件管理功能
// ***************************************************************************************

import { App, TFile, TFolder, normalizePath } from 'obsidian';

export interface FileOperationResult {
	success: boolean;
	path?: string;
	error?: string;
}

export interface FileInfo {
	path: string;
	name: string;
	basename: string;
	extension: string;
	parent: string;
}

export class FileService {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	getFileInfo(file: TFile): FileInfo {
		return {
			path: file.path,
			name: file.name,
			basename: file.basename,
			extension: file.extension,
			parent: file.parent?.path || ''
		};
	}

	isFolder(path: string): boolean {
		const abstractFile = this.app.vault.getAbstractFileByPath(normalizePath(path));
		return abstractFile instanceof TFolder;
	}

	isFile(path: string): boolean {
		const abstractFile = this.app.vault.getAbstractFileByPath(normalizePath(path));
		return abstractFile instanceof TFile;
	}

	folderExists(path: string): boolean {
		return this.isFolder(path);
	}

	fileExists(path: string): boolean {
		return this.isFile(path);
	}

	getFolder(path: string): TFolder | null {
		const folder = this.app.vault.getAbstractFileByPath(normalizePath(path));
		return folder instanceof TFolder ? folder : null;
	}

	getFile(path: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
		return file instanceof TFile ? file : null;
	}

	getAllMarkdownFiles(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getAllFolders(): TFolder[] {
		const abstractFiles = this.app.vault.getAllLoadedFiles();
		return abstractFiles.filter((f): f is TFolder => f instanceof TFolder);
	}

	async moveFile(file: TFile, targetFolder: string, newName?: string): Promise<FileOperationResult> {
		try {
			const folder = this.getFolder(targetFolder);
			if (!folder) {
				return { success: false, error: `目标文件夹不存在: ${targetFolder}` };
			}
			const fileName = newName || file.name;
			const newPath = normalizePath(`${targetFolder}/${fileName}`);
			if (this.fileExists(newPath) && newPath !== file.path) {
				return { success: false, error: `目标位置已存在文件: ${fileName}` };
			}
			if (newPath === file.path) {
				return { success: true, path: newPath };
			}
			await this.app.fileManager.renameFile(file, newPath);
			return { success: true, path: newPath };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	}

	async copyFile(file: TFile, targetFolder: string, newName?: string): Promise<FileOperationResult> {
		try {
			const folder = this.getFolder(targetFolder);
			if (!folder) {
				return { success: false, error: `目标文件夹不存在: ${targetFolder}` };
			}
			const fileName = newName || file.name;
			const newPath = normalizePath(`${targetFolder}/${fileName}`);
			if (this.fileExists(newPath)) {
				return { success: false, error: `目标位置已存在文件: ${fileName}` };
			}
			await this.app.vault.copy(file, newPath);
			return { success: true, path: newPath };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	}

	async deleteFile(file: TFile): Promise<FileOperationResult> {
		try {
			await this.app.vault.delete(file);
			return { success: true };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	}

	async renameFile(file: TFile, newName: string): Promise<FileOperationResult> {
		try {
			const folder = file.parent?.path || '';
			const newPath = normalizePath(`${folder}/${newName}`);
			if (this.fileExists(newPath) && newPath !== file.path) {
				return { success: false, error: `已存在同名文件: ${newName}` };
			}
			if (newName === file.name) {
				return { success: true, path: newPath };
			}
			await this.app.fileManager.renameFile(file, newPath);
			return { success: true, path: newPath };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	}

	async createFolder(path: string): Promise<FileOperationResult> {
		try {
			await this.app.vault.createFolder(normalizePath(path));
			return { success: true, path: normalizePath(path) };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	}

	async ensureFolder(path: string): Promise<FileOperationResult> {
		if (this.folderExists(path)) {
			return { success: true, path: normalizePath(path) };
		}
		return this.createFolder(path);
	}

	async readFile(file: TFile): Promise<string> {
		return await this.app.vault.read(file);
	}

	async modifyFile(file: TFile, content: string): Promise<FileOperationResult> {
		try {
			await this.app.vault.modify(file, content);
			return { success: true };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	}

	async processFile(file: TFile, processor: (content: string) => string): Promise<FileOperationResult> {
		try {
			await this.app.vault.process(file, processor);
			return { success: true };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	}
}
