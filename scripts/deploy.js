#!/usr/bin/env node
// ***************************************************************************************
// * 部署脚本
// * 将构建后的插件文件复制到目标目录，供 Obsidian 直接加载
// * 用法: node scripts/deploy.js [目标路径]
// ***************************************************************************************

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 源文件目录
const SOURCE_DIR = path.resolve(__dirname, '..');

// 默认目标目录（与插件目录同级）
const DEFAULT_TARGET_DIR = path.resolve(SOURCE_DIR, '..', 'obsidian-auto-plus');

// 需要复制的文件
const FILES_TO_COPY = [
    'main.js',
    'manifest.json',
    'styles.css'  // 可选，如果有样式文件
];

function log(message, type = 'info') {
    const colors = {
        info: '\x1b[36m',    // 青色
        success: '\x1b[32m', // 绿色
        error: '\x1b[31m',   // 红色
        warning: '\x1b[33m', // 黄色
        reset: '\x1b[0m'
    };
    console.log(`${colors[type]}[deploy]${colors.reset} ${message}`);
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        log(`创建目录: ${dir}`, 'info');
    }
}

function copyFile(src, dest) {
    try {
        fs.copyFileSync(src, dest);
        const stats = fs.statSync(dest);
        log(`✓ ${path.basename(src)} (${(stats.size / 1024).toFixed(1)} KB)`, 'success');
        return true;
    } catch (error) {
        log(`✗ ${path.basename(src)} - ${error.message}`, 'error');
        return false;
    }
}

function main() {
    // 获取目标路径
    const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_TARGET_DIR;

    log('='.repeat(50));
    log('Obsidian Auto Plus 部署脚本');
    log('='.repeat(50));
    log(`源目录: ${SOURCE_DIR}`);
    log(`目标目录: ${targetDir}`);
    log('-'.repeat(50));

    // 检查源文件
    const missingFiles = FILES_TO_COPY.filter(file => {
        const srcPath = path.join(SOURCE_DIR, file);
        return !fs.existsSync(srcPath);
    });

    if (missingFiles.includes('main.js')) {
        log('错误: main.js 不存在，请先运行 npm run build', 'error');
        process.exit(1);
    }

    if (missingFiles.length > 0) {
        log(`警告: 以下文件不存在，将跳过: ${missingFiles.join(', ')}`, 'warning');
    }

    // 确保目标目录存在
    ensureDir(targetDir);

    // 复制文件
    let copied = 0;
    let failed = 0;

    for (const file of FILES_TO_COPY) {
        const srcPath = path.join(SOURCE_DIR, file);
        const destPath = path.join(targetDir, file);

        if (fs.existsSync(srcPath)) {
            if (copyFile(srcPath, destPath)) {
                copied++;
            } else {
                failed++;
            }
        }
    }

    log('-'.repeat(50));
    log(`部署完成: ${copied} 个文件成功${failed > 0 ? `, ${failed} 个失败` : ''}`, copied > 0 ? 'success' : 'error');

    // 提示 Obsidian 刷新
    log('');
    log('提示: 在 Obsidian 中按 Ctrl+R (或 Cmd+R) 刷新插件', 'info');
    log('='.repeat(50));
}

main();
