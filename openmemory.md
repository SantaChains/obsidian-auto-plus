# Obsidian YAML Frontmatter 完全指南

## 概述

YAML frontmatter 是 Obsidian 中用于存储笔记元数据的标准格式，位于笔记文件顶部的 `---` 分隔符之间。

```yaml
---
key: value
---
```

---

## 内置属性 (Native Properties)

Obsidian 原生支持以下 4 个属性：

| 属性 | 类型 | 说明 |
|------|------|------|
| `tags` | List | 笔记标签 |
| `aliases` | List | 笔记别名（用于链接建议） |
| `cssclasses` | List | 自定义 CSS 类名 |
| `publish` | Checkbox | 控制 Publish 发布行为 |

### 示例

```yaml
---
tags:
  - yaml
  - obsidian
aliases:
  - My Note
  - Alternative Name
cssclasses:
  - custom-class
publish: true
---
```

---

## 属性类型 (Property Types)

Obsidian 支持 7 种属性类型：

### 1. Text (文本)

单行字符串，Markdown 格式不会渲染。

```yaml
---
title: A New Hope
link: "[[Episode IV]]"
url: https://www.example.com
---
```

### 2. List (列表)

多个值，每行以 `- ` 前缀。

```yaml
---
cast:
  - Mark Hamill
  - Harrison Ford
  - Carrie Fisher
links:
  - "[[Link]]"
  - "[[Link2]]"
---
```

### 3. Number (数字)

整数或小数，不支持表达式。

```yaml
---
year: 1977
rating: 4.5
pie: 3.14
---
```

### 4. Checkbox (复选框)

布尔值：`true`、`false` 或 null。

```yaml
---
favorite: true
reply: false
completed: null
---
```

### 5. Date (日期)

ISO 8601 日期格式：`YYYY-MM-DD`

```yaml
---
date: 2020-08-21
---
```

### 6. Date & Time (日期时间)

ISO 8601 完整格式。

```yaml
---
time: 2020-08-21T10:30:00
due: 2024-02-01T14:30:00
---
```

### 7. Tags (标签)

特殊类型，与 `#tag` 语法不同，专门用于 frontmatter。

```yaml
---
tags:
  - tag1
  - nested/tag2
---
```

---

## YAML 格式规范

### 基本格式

```yaml
---
name: value
list:
  - item1
  - item2
number: 42
---
```

### 格式要求

- 属性名在同一文件中必须唯一
- 值可以是文本、数字、布尔值、日期或列表
- 内部链接必须加引号：`"[[Link]]"`
- frontmatter 必须位于文件最开头
- 列表语法支持 YAML 列表和 JSON 数组两种格式

### JSON 格式 (替代方案)

```yaml
---
{"tags": ["journal"], "publish": false}
---
```

> 注意：JSON 格式会在保存时自动转换为 YAML。

---

## 标签 (Tags) 语法

### 支持的格式

```yaml
# 普通标签
#tag

# 嵌套标签
#nested/tag

# 带连字符
#tag-with-dashes

# 带下划线
#tag_with_underscores
```

### 标签规则

- 可用字符：字母（任何语言）、数字（不能在首位）、下划线 `_`、连字符 `-`、正斜杠 `/`
- 在 frontmatter 中使用时引号包围 `#`：

```yaml
tags: " #yaml #obsidian "
```

---

## 常用社区插件属性

### Dataview 插件

```yaml
---
date: 2021-05-09
due: 2021-05-15
status: in-progress
priority: high
---
```

### Tasks 插件

```yaml
---
tasks:
  - [ ] Task 1
  - [x] Task 2
done: 2024-01-01
---
```

### Exocortex 插件

```yaml
---
exo__Asset_uid: 550e8400-e29b-41d4-a716-446655440000
exo__Asset_label: Review PR #123
exo__Asset_createdAt: 2025-10-26T14:30:45
exo__Instance_class:
  - "[[ems__Task]]"
---
```

---

## 最佳实践

### 最小配置示例

```yaml
---
date: 2021-05-09
tags: " #yaml #obsidian "
aliases:
  - obyaml
  - obsidian的フロントマター
---
```

### 发布控制

- 公开笔记：设置 `publish: true`
- 私有笔记：不设置或设置 `publish: false`

### 类型强制

属性名称的 type 一旦确定，在整个 vault 中全局生效。

---

## 参考来源

- [Obsidian Properties 官方文档](https://help.obsidian.md/Editing+and+formatting/Properties)
- [Obsidian 中文帮助](https://obsidian.md/zh/help/%E7%BC%96%E8%BE%91%E4%B8%8E%E6%A0%BC%E5%BC%8F%E5%8C%96/%E5%B1%9E%E6%80%A7)
- [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills/blob/main/skills/obsidian-markdown/references/PROPERTIES.md)
