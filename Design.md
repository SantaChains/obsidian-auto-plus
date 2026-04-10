# Obsidian Note MV Plus 自动化插件设计文档

## 1. 核心架构

### 1.1 模块划分

插件分为两大核心模块：

| 模块 | 说明 |
|------|------|
| **规则（Rule）** | 定义触发条件，包含对象来源 + 条件判断 |
| **操作（Action）** | 定义执行的动作，多个操作可组合拼接 |

### 1.2 设计原则

- 规则和操作均支持**多个**设置
- 支持**组合拼接**和**复用**
- 所有可设置功能均支持**编辑、删除、添加**
- 文字/字符串内容支持**正则表达式**
- 存储方式：**Obsidian 原生存储**（data.json）
- 配置界面：**表单式配置**

---

## 2. 规则模块（Rule）

### 2.1 规则基础属性

| 属性 | 说明 |
|------|------|
| `id` | 唯一标识符 |
| `name` | 规则名称，用于显示和区分 |
| `enabled` | 是否启用 |
| `trigger` | 触发方式 |
| `source` | 对象来源（包含/排除） |
| `conditions` | 条件判断 |

### 2.2 触发方式（Trigger）

支持三种触发方式，可同时启用：

| 触发类型 | 说明 | 示例 |
|----------|------|------|
| **手动触发** | 注册到 Obsidian 命令面板，用户手动触发 | 「移动工作文档到归档」 |
| **自动触发** | 文件创建、修改、删除、重命名时自动触发 | 文件修改 → 自动添加标签 |
| **定时触发（Cron）** | 按 cron 表达式定时执行 | 「每天 9:00 整理笔记」 |

**Cron 能力要求：**
- 标准 5 段式 cron：`* * * * *`（分 时 日 月 周）
- 启动时执行一次
- 间隔重复执行（如每隔 30 分钟）
- 多个表达式组合（如工作日 9:00，周末 10:00）

### 2.3 对象来源（Source）

先**包含**后**排除**（白名单优先）

#### 包含类型

| 类型 | 说明 | 示例 |
|------|------|------|
| 单个文件 | 指定 vault 中某个具体文件 | `2024-01-01.md` |
| 文件夹 | 指定 vault 中的文件夹 | `日记/2024` |
| YAML 属性 | 根据 frontmatter 属性筛选 | `tags: [工作, 重要]` |
| 文件元数据 | 创建时间、修改时间 | `ctime > 2024-01-01` |

#### 排除类型

与包含类型一致，可选择单个文件、文件夹、YAML 属性、文件元数据

**处理流程：**
```
包含范围 → 排除部分 → 命中对象
```

### 2.4 条件判断（Condition）

#### 2.4.1 支持的字段

| 字段 | 说明 |
|------|------|
| `tags` | YAML frontmatter 中的 tags 标签 |
| `title` | 文件标题（不含扩展名） |
| `content` | 文件正文内容 |
| `yaml.*` | YAML frontmatter 中的任意自定义键 |
| `ctime` | 文件创建时间 |
| `mtime` | 文件修改时间 |

#### 2.4.2 YAML 属性值类型

| 值类型 | 示例 |
|--------|------|
| 字符串（带引号） | `project: "A项目"` |
| 裸字符串（无引号） | `status: 进展中` |
| 数组（tags） | `tags: [工作, 重要]` |
| 数值（number） | `priority: 5` |
| 时间（datetime） | `ctime: 2024-01-01` |
| 布尔（boolean） | `archived: true` |

#### 2.4.3 条件键（Key）判断

| 类型 | 说明 |
|------|------|
| **有值** | key 存在且有值 |
| **无值** | key 不存在或值为空 |

#### 2.4.4 条件运算符

| 数据类型 | 支持的运算符 |
|----------|--------------|
| 字符串 | `equals`, `contains`, `startsWith`, `endsWith`, `regex`, `not` |
| 数组 | `contains`（含任一）, `containsAll`（全部含）, `notContains` |
| 数值 | `=`, `>`, `<`, `>=`, `<=`, `!=` |
| 时间 | `>`, `<`, `>=`, `<=`, `between` |
| 布尔 | `=`, `!=` |

#### 2.4.5 逻辑关系

支持**括号分组**的混合逻辑：`AND` + `OR`

**示例：**
```
( tags contains "工作" OR title contains "报告" ) AND priority >= 5
```

**条件模式：**
- `OR`：该条件与其他条件满足任一即可执行
- `AND`：该条件与其他条件必须全部满足才执行

---

## 3. 操作模块（Action）

### 3.1 文件操作

| 操作 | 说明 |
|------|------|
| `copy` | 复制文件到目标位置 |
| `move` | 移动文件到目标位置 |
| `rename` | 重命名文件 |
| `delete` | 删除文件（永久删除或回收站） |

### 3.2 元数据操作

| 操作 | 说明 |
|------|------|
| `yaml.set` | 设置 YAML 属性值 |
| `yaml.delete` | 删除 YAML 属性 |
| `yaml.appendArray` | 追加到数组 |
| `yaml.math` | 数值运算（如 `priority + 1`） |
| `tags.add` | 添加标签 |
| `tags.remove` | 移除标签 |
| `extractToYaml` | 提取属性到 YAML |

### 3.3 内容操作

| 操作 | 说明 |
|------|------|
| `content.replace` | 文本内容替换（支持正则） |
| `content.insert` | 插入内容到文件（开头/末尾/指定位置） |
| `content.extract` | 提取文件内容片段 |

### 3.4 系统操作

| 操作 | 说明 |
|------|------|
| `obsidian.command` | 调用 Obsidian 内置命令 |
| `script.javascript` | 执行自定义 JavaScript 脚本 |
| `script.system` | 执行系统命令（PowerShell） |

### 3.5 重命名/移动 变量

可用变量：

| 变量 | 说明 | 示例 |
|------|------|------|
| `{{filename}}` | 原文件名 | `2024-01-01` |
| `{{ext}}` | 扩展名 | `md` |
| `{{ctime}}` | 创建时间 | `2024-01-01` |
| `{{mtime}}` | 修改时间 | `2024-12-01` |
| `{{yaml.*}}` | YAML 属性值 | `{{yaml.project}}` → `A项目` |
| `{{tags}}` | 标签数组 | `[工作,重要]` |

---

## 4. 组合与复用

### 4.1 组合方式

| 类型 | 说明 |
|------|------|
| **顺序执行** | 一个规则包含多个操作，按顺序执行，可排序 |
| **规则组合** | 多个规则组合成新规则 |
| **条件分支** | 根据不同条件执行不同操作（If-Else） |

**组合能力：**
- 多个规则 + 多个操作
- 一个规则 + 多个操作
- 多个规则 + 一个操作

### 4.2 复用机制

| 类型 | 说明 |
|------|------|
| **操作模板** | 将操作保存为模板，供多个规则复用 |
| **条件模板** | 将条件组合保存为模板 |
| **规则组模板** | 将包含多个规则的完整工作流保存复用 |
| **导入/导出** | 模板支持导出分享和导入使用 |

---

## 5. 数据存储

### 5.1 存储位置

- 使用 **Obsidian 原生存储**（插件 data.json）
- 日志存储在 vault 根目录 `.note-mv-plus/logs/` 文件夹

### 5.2 存储结构

```typescript
interface PluginData {
  version: string;
  rules: Rule[];
  actions: Action[];
  templates: Template[];
  settings: Settings;
}
```

---

## 5.3 统一 Schema（JSON Schema）

所有数据结构均使用 **JSON Schema** 定义，确保类型安全和版本兼容。

#### 5.3.1 Schema 版本

| 版本 | 说明 |
|------|------|
| `1.0.0` | 初始版本 |

#### 5.3.2 Schema 定义

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://note-mv-plus.app/schema/v1.0.0.json",
  "title": "Note MV Plus Schema",
  "version": "1.0.0",
  "type": "object",
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$"
    },
    "rules": {
      "type": "array",
      "items": { "$ref": "#/$defs/Rule" }
    },
    "actions": {
      "type": "array",
      "items": { "$ref": "#/$defs/Action" }
    },
    "templates": {
      "type": "array",
      "items": { "$ref": "#/$defs/Template" }
    },
    "settings": { "$ref": "#/$defs/Settings" }
  },
  "required": ["version", "rules", "actions", "templates", "settings"],
  "$defs": {
    "Rule": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "enabled": { "type": "boolean" },
        "trigger": { "$ref": "#/$defs/Trigger" },
        "source": { "$ref": "#/$defs/Source" },
        "conditions": { "$ref": "#/$defs/Conditions" },
        "actions": {
          "type": "array",
          "items": { "type": "string" }
        }
      },
      "required": ["id", "name", "enabled", "trigger", "source", "actions"]
    },
    "Trigger": {
      "type": "object",
      "properties": {
        "manual": { "type": "boolean" },
        "auto": {
          "type": "object",
          "properties": {
            "enabled": { "type": "boolean" },
            "events": {
              "type": "array",
              "items": {
                "enum": ["create", "modify", "delete", "rename"]
              }
            }
          }
        },
        "cron": {
          "type": "object",
          "properties": {
            "enabled": { "type": "boolean" },
            "expressions": {
              "type": "array",
              "items": { "type": "string" }
            },
            "runOnStartup": { "type": "boolean" },
            "interval": {
              "type": "object",
              "properties": {
                "value": { "type": "number" },
                "unit": { "enum": ["minutes", "hours", "days"] }
              }
            }
          }
        }
      }
    },
    "Source": {
      "type": "object",
      "properties": {
        "include": {
          "type": "array",
          "items": { "$ref": "#/$defs/SourceItem" }
        },
        "exclude": {
          "type": "array",
          "items": { "$ref": "#/$defs/SourceItem" }
        }
      }
    },
    "SourceItem": {
      "type": "object",
      "properties": {
        "type": {
          "enum": ["file", "folder", "yaml", "metadata"]
        },
        "path": { "type": "string" },
        "yaml": {
          "type": "object",
          "properties": {
            "key": { "type": "string" },
            "operator": { "type": "string" },
            "value": { }
          }
        },
        "metadata": {
          "type": "object",
          "properties": {
            "field": { "enum": ["ctime", "mtime"] },
            "operator": { "type": "string" },
            "value": { "type": "string" }
          }
        }
      }
    },
    "Conditions": {
      "type": "object",
      "properties": {
        "logic": { "enum": ["AND", "OR"] },
        "groups": {
          "type": "array",
          "items": { "$ref": "#/$defs/ConditionGroup" }
        }
      }
    },
    "ConditionGroup": {
      "type": "object",
      "properties": {
        "logic": { "enum": ["AND", "OR"] },
        "conditions": {
          "type": "array",
          "items": { "$ref": "#/$defs/Condition" }
        }
      }
    },
    "Condition": {
      "type": "object",
      "properties": {
        "field": {
          "enum": ["tags", "title", "content", "yaml", "ctime", "mtime"]
        },
        "yamlKey": { "type": "string" },
        "operator": { "type": "string" },
        "value": { },
        "valueType": {
          "enum": ["string", "number", "boolean", "array", "datetime"]
        }
      }
    },
    "Action": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "type": {
          "enum": [
            "file.copy", "file.move", "file.rename", "file.delete",
            "yaml.set", "yaml.delete", "yaml.appendArray", "yaml.math",
            "tags.add", "tags.remove", "extractToYaml",
            "content.replace", "content.insert", "content.extract",
            "obsidian.command", "script.javascript", "script.system"
          ]
        },
        "params": { "type": "object" }
      },
      "required": ["id", "name", "type", "params"]
    },
    "Template": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "type": { "enum": ["rule", "action", "condition"] },
        "data": { }
      },
      "required": ["id", "name", "type", "data"]
    },
    "Settings": {
      "type": "object",
      "properties": {
        "logEnabled": { "type": "boolean" },
        "logRetention": {
          "type": "object",
          "properties": {
            "maxFiles": { "type": "number" },
            "maxDays": { "type": "number" }
          }
        },
        "deleteMode": { "enum": ["permanent", "trash"] },
        "concurrentMode": { "enum": ["sequential", "parallel"] }
      }
    }
  }
}
```

#### 5.3.3 Schema 验证时机

- **保存时验证**：规则/操作保存时自动进行 Schema 校验，不合格不允许保存

---

## 5.4 向后兼容与版本迁移

#### 5.4.1 迁移策略

采用 **手动确认迁移** 策略：

| 步骤 | 说明 |
|------|------|
| 1. 检测版本 | 启动时检测当前 data.json 的 schema 版本 |
| 2. 提示用户 | 发现旧版本时，提示用户备份数据 |
| 3. 用户确认 | 用户手动确认后执行迁移 |
| 4. 执行迁移 | 按照迁移脚本将旧数据转换为新 Schema |
| 5. 验证保存 | 迁移后验证新数据是否符合 Schema |

#### 5.4.2 迁移命令

```typescript
interface MigrationCommand {
  fromVersion: string;
  toVersion: string;
  migrate: (data: unknown) => Promise<unknown>;
  validate: (data: unknown) => boolean;
}
```

#### 5.4.3 版本降级

- **不支持**降级
- 建议用户在迁移前导出备份

#### 5.4.4 迁移示例（v0.x → v1.0.0）

```typescript
const migrations: MigrationCommand[] = [
  {
    fromVersion: "0.x",
    toVersion: "1.0.0",
    migrate: async (data) => {
      const old = data as OldDataFormat;
      return {
        version: "1.0.0",
        rules: old.rules.map(r => ({
          id: r.id || generateId(),
          name: r.name,
          enabled: r.enabled ?? true,
          trigger: convertTrigger(r.trigger),
          source: convertSource(r.source),
          conditions: convertConditions(r.conditions),
          actions: r.actionIds || []
        })),
        actions: old.actions || [],
        templates: old.templates || [],
        settings: old.settings || {}
      };
    },
    validate: (data) => {
      // 使用 JSON Schema 验证
      return validateAgainstSchema(data, "1.0.0");
    }
  }
];
```

---

## 6. 错误处理与日志

### 6.1 错误处理策略

- **失败时停止并通知**：操作失败时暂停后续操作并提示用户

### 6.2 日志系统

| 级别 | 说明 |
|------|------|
| **执行日志** | 记录规则何时被触发、执行了什么操作 |

日志格式：
```json
{
  "timestamp": "2024-01-01T09:00:00Z",
  "ruleId": "rule_001",
  "ruleName": "归档旧笔记",
  "trigger": "cron",
  "matchedFiles": ["note1.md", "note2.md"],
  "actions": [
    { "type": "move", "target": "archive/", "status": "success" }
  ]
}
```

---

## 7. CRUD 功能

所有模块均支持完整的增删改查：

| 模块 | CRUD |
|------|------|
| 规则（Rule） | ✓ 新建、编辑、删除、查看 |
| 操作（Action） | ✓ 新建、编辑、删除、查看 |
| 条件（Condition） | ✓ 新建、编辑、删除、查看 |
| 模板（Template） | ✓ 导入、导出、备份、恢复 |

---

## 8. 用户界面

### 8.1 配置方式

- **表单式配置**：通过填写表单配置规则
- 未来可扩展：**可视化画布**（节点连线图）

### 8.2 可视化画布节点类型（未来扩展）

| 节点类型 | 说明 |
|----------|------|
| 触发节点（Trigger） | 定义触发条件 |
| 条件节点（Condition） | 定义文件筛选条件 |
| 操作节点（Action） | 定义文件操作 |
| 变量/转换节点 | 支持变量传递和转换 |

---

## 9. 核心竞争力与差异化能力

基于对 Automa、Zapier、n8n、IFTTT、QuickAdd、Curator 等自动化工具的研究，结合 Obsidian 生态特点，本插件定位以下核心差异化能力：

### 9.1 差异化能力矩阵

| 能力 | 说明 | 竞品参考 |
|------|------|----------|
| **强大 YAML 条件系统** | 支持多种数据类型（字符串/数组/数值/时间/布尔），支持无 key 判断，支持正则匹配，括号分组逻辑 | 超越 Curator 的 Dataview 查询 |
| **白名单优先对象模型** | 先包含后排除的对象筛选器，支持文件/文件夹/YAML/元数据的组合 | 独有 |
| **实时文件事件驱动** | 基于文件系统事件的实时触发，非轮询，毫秒级响应 | 超越 QuickAdd Macro |
| **循环执行（Loop）** | 支持 While Loop、For Each，可遍历文件列表批量处理 | 学习 Automa/n8n |
| **AI 集成** | 调用外部 AI API 进行内容摘要、分类、生成 | 学习 n8n AI |
| **HTTP 请求** | 发送 HTTP 请求，与外部服务集成 | 学习 Zapier/n8n |
| **MCP 协议集成** | 将插件作为 MCP Server 暴露工具给 AI Agent 调用 | 学习 n8n MCP |
| **Dry Run 模拟** | 执行前模拟运行，预览所有操作结果 | 学习 Curator |
| **批量操作进度** | 批量操作时显示进度条，支持取消 | 独有 |
| **错误恢复机制** | 执行失败自动重试或回滚 | 独有 |

### 9.2 核心能力详细设计

#### 9.2.1 循环执行（Loop）

```json
{
  "type": "loop",
  "items": { "$ref": "#/$defs/FileList" },
  "variable": "file",
  "body": [
    { "$ref": "#/$defs/Action" }
  ],
  "maxIterations": 1000,
  "continueOnError": false
}
```

**支持类型：**
- `forEach`：遍历数组/文件列表
- `while`：条件满足时循环
- `doWhile`：先执行后判断

**示例场景：**
- 批量重命名文件夹下所有文件
- 遍历所有包含某标签的笔记并移动

#### 9.2.2 AI 集成

```json
{
  "type": "ai.request",
  "provider": "openai | anthropic | custom",
  "operation": "summarize | classify | generate | extract",
  "prompt": "请总结以下笔记的要点：{{content}}",
  "outputVar": "summary",
  "model": "gpt-4"
}
```

**AI 操作类型：**

| 操作 | 说明 |
|------|------|
| `summarize` | 生成笔记摘要 |
| `classify` | 根据内容自动分类/打标签 |
| `generate` | 根据模板生成内容 |
| `extract` | 提取关键信息（日期、人名、地点等） |
| `translate` | 翻译笔记内容 |

#### 9.2.3 HTTP 请求

```json
{
  "type": "http.request",
  "method": "GET | POST | PUT | DELETE",
  "url": "https://api.example.com/webhook",
  "headers": {
    "Authorization": "Bearer {{env.API_KEY}}"
  },
  "body": {
    "title": "{{title}}",
    "content": "{{content}}",
    "tags": "{{tags}}"
  },
  "outputVar": "response",
  "timeout": 30000
}
```

**应用场景：**
- 笔记保存时同步到 Notion
- 发送 Webhook 通知
- 调用外部 API 处理内容

#### 9.2.4 MCP 协议集成

```json
{
  "type": "mcp.server",
  "enabled": true,
  "port": 7890,
  "tools": [
    "note_mv_plus.execute_rule",
    "note_mv_plus.query_files",
    "note_mv_plus.update_yaml"
  ]
}
```

**暴露的工具：**
- `execute_rule`：执行指定规则
- `query_files`：查询符合条件的文件
- `update_yaml`：更新文件 YAML 属性

#### 9.2.5 Dry Run 模拟

```json
{
  "dryRun": true,
  "preview": {
    "showAffectedFiles": true,
    "showActions": true,
    "showChanges": true
  }
}
```

**模拟输出：**
```
[Dry Run] 规则：归档旧笔记
  匹配文件：3 个
    - note1.md (修改时间: 2023-01-01)
    - note2.md (修改时间: 2023-02-15)
    - note3.md (修改时间: 2023-03-20)

  将执行操作：
    1. move → archive/note1.md
    2. move → archive/note2.md
    3. move → archive/note3.md

  YAML 变更：
    - note1.md: added archived=true
    - note2.md: added archived=true
    - note3.md: added archived=true
```

#### 9.2.6 批量操作进度

```json
{
  "batchProgress": {
    "enabled": true,
    "showDialog": true,
    "canCancel": true,
    "updateInterval": 100
  }
}
```

**进度 UI：**
```
┌─────────────────────────────────────┐
│ 正在处理：归档旧笔记                  │
├─────────────────────────────────────┤
│ ████████████░░░░░░░░  50% (5/10)   │
│ 当前文件：note5.md                   │
│                                     │
│ [取消]                              │
└─────────────────────────────────────┘
```

#### 9.2.7 错误恢复机制

```json
{
  "errorHandling": {
    "strategy": "retry | rollback | skip | stop",
    "maxRetries": 3,
    "retryDelay": 1000,
    "rollbackOnFailure": true
  }
}
```

**策略类型：**

| 策略 | 说明 |
|------|------|
| `retry` | 失败后重试，最多重试 3 次 |
| `rollback` | 失败后回滚所有已执行操作 |
| `skip` | 跳过失败项，继续处理下一个 |
| `stop` | 立即停止，显示错误信息 |

---

## 10. 待确认项

以下细节需要在后续需求确认中补充：

| 项目 | 说明 |
|------|------|
| 正则表达式引擎 | 需要确认具体实现（JavaScript RegExp 兼容） |
| 文件删除策略 | 永久删除 vs 移动到回收站 |
| 日志保留策略 | 日志文件保留天数/大小限制 |
| 并发执行控制 | 多个规则同时触发时的处理策略 |
