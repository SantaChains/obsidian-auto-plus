# Auto Plus

增强版自动笔记处理器，支持 YAML 属性判断、多种操作类型（移动/复制/删除/重命名）和灵活的规则配置。

## 功能特性

- **多种条件类型**：标签匹配、标题正则匹配、YAML 属性判断、修改时间、文件路径
- **多种操作类型**：移动、复制、删除、重命名、更新 YAML 属性、添加标签
- **灵活的 YAML 条件**：支持等于、不等于、包含、开头、结尾、存在、不存在等操作符
- **重命名模板**：支持使用模板变量动态生成新文件名
- **自动/手动触发**：可选择自动处理或手动触发
- **组合条件**：支持 AND/OR 逻辑组合多个条件
- **批量处理**：对已有笔记批量应用规则

## 条件类型

### 1. 标签匹配 (Tag)
匹配笔记中的标签，支持嵌套标签如 `#project/work`。

### 2. 标题匹配 (Title)
使用 JavaScript 正则表达式匹配笔记标题。

### 3. YAML 属性匹配 (YAML)
根据笔记 frontmatter 中的 YAML 属性值进行判断。

### 4. 修改时间 (MTime)
根据文件最后修改时间进行判断。

**格式：** `<操作符><数值><单位>`
- 操作符：`<` (小于), `>` (大于), `=` (等于)
- 数值：数字
- 单位：`m` (分钟), `h` (小时), `d` (天), `w` (周), `M` (月)

**示例：**
- `<30d` - 30天内修改过
- `>7d` - 7天未修改
- `=1h` - 1小时内修改

### 5. 文件路径 (Path)
使用正则表达式匹配文件完整路径。

**示例：**
- `^content/drafts/` - 匹配 drafts 文件夹下的文件
- `\.md$` - 匹配所有 Markdown 文件

**支持的操作符：**
- `equals` - 等于
- `notEquals` - 不等于
- `contains` - 包含
- `startsWith` - 开头是
- `endsWith` - 结尾是
- `exists` - 属性存在
- `notExists` - 属性不存在

**示例：**
- `draft: false` 时移动已完成的笔记
- `status: published` 时复制到发布文件夹
- `archived: true` 时删除或归档

## 操作类型

### 移动 (Move)
将文件移动到指定文件夹。

### 复制 (Copy)
将文件复制到指定文件夹，原文件保留。

### 删除 (Delete)
删除匹配的文件（谨慎使用）。

### 重命名 (Rename)
重命名文件，支持模板变量：
- `{{title}}` - 原文件名
- `{{date}}` - 当前日期 (YYYY-MM-DD)
- `{{time}}` - 当前时间 (HH-mm)
- `{{yaml:key}}` - YAML 属性值

### 更新 YAML (UpdateYaml)
更新或添加 frontmatter 中的 YAML 属性值。支持模板变量。

**示例：**
- 更新 `updated` 字段为当前日期
- 设置 `status` 为 `archived`

### 添加标签 (AddTag)
向笔记添加标签到 frontmatter 的 tags 数组中。支持模板变量。

**重命名模板示例：**
```
{{date}}-{{title}}.md
archived-{{title}}.md
{{yaml:category}}-{{title}}.md
```

## 触发方式

### 自动触发 (Auto)
在创建、编辑或重命名笔记时自动检查规则并执行操作。

### 手动触发 (Manual)
通过命令面板手动触发规则检查。

## 规则优先级

规则按顺序从上到下检查，**第一个匹配的规则**会被执行，后续规则将被忽略（除非开启"执行所有规则"选项）。

## 禁用处理

在笔记的 frontmatter 中添加以下内容可禁用自动处理：
```yaml
---
AutoNoteMover: disable
---
```

## 使用示例

### 示例 1：发布完成的笔记
```yaml
条件类型: YAML
YAML 键: draft
操作符: equals
值: false
操作: 移动
目标文件夹: Published
```

### 示例 2：归档旧笔记
```yaml
条件类型: YAML
YAML 键: archived
操作符: equals
值: true
操作: 移动
目标文件夹: Archive
```

### 示例 3：按标签分类
```yaml
条件类型: 标签
标签: #project/work
操作: 移动
目标文件夹: Work/Projects
```

### 示例 4：重命名带日期
```yaml
条件类型: 标题
正则: ^Daily-
操作: 重命名
重命名模板: "{{date}}-Daily-Note.md"
```

## 安装

1. 下载最新 release
2. 解压到 `.obsidian/plugins/obsidian-auto-plus/` 目录
3. 在 Obsidian 设置中启用插件

## 开发

```bash
npm install
npm run dev    # 开发模式
npm run build  # 构建
```

### 自动部署到 Obsidian（可选）

为了方便在 Obsidian 中直接测试插件，提供了自动部署功能：

#### 方法 1：使用部署脚本（推荐）

```bash
# 构建后手动部署
npm run build
node scripts/deploy.js

# 部署到自定义路径
node scripts/deploy.js /path/to/your/vault/.obsidian/plugins/obsidian-auto-plus
```

部署脚本会将 `main.js` 和 `manifest.json` 复制到 `obsidian-auto-plus` 目录（与插件源码目录同级）。

#### 方法 2：构建时自动部署

编辑 `esbuild.config.mjs`，取消注释以下行：

```javascript
// ============================================
// 构建后自动部署到目标目录（可选功能）
// 如需启用，取消下面一行的注释：
// const AUTO_DEPLOY = true;
// ============================================
const AUTO_DEPLOY = false;  // <-- 改为 true
```

启用后，每次运行 `npm run build` 都会自动执行部署。

#### 在 Obsidian 中加载插件

1. 部署完成后，在 Obsidian 中打开设置 → 社区插件
2. 确保已启用 `Auto Plus` 插件
3. 按 `Ctrl+R` (Windows/Linux) 或 `Cmd+R` (Mac) 刷新插件
4. 或使用命令面板执行 `Reload app without saving`

## 致谢

基于 [Auto Note Mover](https://github.com/farux/obsidian-auto-note-mover) 开发，感谢原作者 faru。

suggest.ts 和 file-suggest.ts 来自 Liam Cain 的 [obsidian-periodic-notes](https://github.com/liamcain/obsidian-periodic-notes)。

---

## 📋 功能状态

### 条件类型

| 功能 | 状态 | 说明 |
|------|------|------|
| 标签匹配 | ✅ 已实现 | 支持精确匹配和正则匹配 |
| 标题匹配 | ✅ 已实现 | 使用 JavaScript 正则表达式 |
| YAML 属性 | ✅ 已实现 | 支持多种比较运算符 |
| 修改时间 | ✅ 已实现 | 支持 <, >, = 操作符 |
| 文件路径 | ✅ 已实现 | 使用正则表达式匹配 |
| 内容搜索 | ❌ 未实现 | 匹配正文内容 |
| 创建时间 | ❌ 未实现 | 文件创建日期范围 |
| 链接数量 | ❌ 未实现 | 入链/出链数量阈值 |
| 文件大小 | ❌ 未实现 | 附件大小判断 |

### 操作类型

| 功能 | 状态 | 说明 |
|------|------|------|
| 移动 | ✅ 已实现 | 移动文件到指定文件夹 |
| 复制 | ✅ 已实现 | 复制文件到指定文件夹 |
| 删除 | ✅ 已实现 | 删除匹配的文件 |
| 重命名 | ✅ 已实现 | 支持模板变量 |
| 更新 YAML | ✅ 已实现 | 支持模板变量 |
| 添加标签 | ✅ 已实现 | 添加到 frontmatter |
| 创建链接 | ❌ 未实现 | 在指定索引笔记中添加反向链接 |
| 执行模板 | ❌ 未实现 | 应用 Templater 模板 |
| 发送通知 | ❌ 未实现 | 系统通知或 webhook |
| 执行命令 | ❌ 未实现 | 调用其他插件命令 |

### 触发器

| 功能 | 状态 | 说明 |
|------|------|------|
| 自动触发 | ✅ 已实现 | 保存/创建/重命名时触发 |
| 手动触发 | ✅ 已实现 | 通过命令面板触发 |
| 定时触发 | ❌ 未实现 | 按时间间隔检查 |
| 链接触发 | ❌ 未实现 | 当笔记被其他笔记链接时触发 |
| 内容变化触发 | ❌ 未实现 | 特定内容出现/消失时触发 |

### 高级功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 组合条件 | ✅ 已实现 | AND/OR 逻辑组合 |
| 变量系统 | ⚠️ 部分 | 仅支持模板变量 |
| 测试模式 | ❌ 未实现 | 预览哪些笔记会受影响 |
| 批量处理 | ⚠️ 基础 | 仅支持基础预览和执行 |
| 规则导入导出 | ⚠️ 部分 | 仅支持复制到剪贴板 |
| 条件嵌套 | ❌ 未实现 | 支持括号优先级 |

---

## 许可证

MIT License - 详见 [LICENSE](LICENSE)
