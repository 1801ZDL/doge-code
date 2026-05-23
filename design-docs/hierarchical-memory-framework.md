# 通用分层记忆框架（Hierarchical Memory Framework, HMF）设计文档

> 版本：v1.0
> 日期：2026-05-21
> 状态：设计阶段

---

## 1. 设计概述

通用分层记忆框架（HMF）是一种为长期记忆系统设计的目录级语义组织结构，旨在将传统的扁平化记忆存储改造为自顶向下、可自动发现、可动态扩展的树形层级结构。该框架不仅适用于 AI 辅助编程场景，也可推广到任何需要大规模、多主题、长周期记忆管理的系统——包括知识库管理、项目文档组织、个人笔记系统、以及多 Agent 协作的记忆共享层。

当前扁平化记忆存储面临的核心问题是 O(N) 线性扩展瓶颈：当记忆文件数量增长到数百个时，每次召回需要读取全部文件的 frontmatter 并一次性送入模型决策，文件 IO 和 token 消耗均随 N 线性增长，且无法利用记忆之间天然的语义分组。HMF 通过引入层级化的目录结构，将召回复杂度从 O(N) 降低到 O(L × sideQuery_cost)，其中 L 为层级深度（通常 3-5）。框架的核心思想是"向下扩展联想"：从根索引出发，逐层评估子层与当前查询的相关性，只沿着高相关性的分支继续深入，最终在叶子层内精选具体文件。这种结构与人类的分类记忆方式一致——先定位到大致领域，再细化到具体主题。

HMF 的设计强调**自动发现**和**自适应维护**。层级结构不是手工预设的，而是在首次接触项目时通过扫描项目文件结构、读取关键配置文件、并由模型推理自动生成。随着记忆的持续写入，框架会定期评估层级结构的合理性，当检测到结构明显不合理（如某层文件过多、新增大量跨层关联）时，自动触发层级重构。整个框架通过 feature flag 与现有扁平搜索共存，支持无缝降级。

---

## 2. 目录结构规范

### 2.1 标准目录树

```
memory/
├── MEMORY.md                    # 根索引：顶层 LAYER 列表 + 全局元数据
├── .hierarchy/                  # 层级元数据（隐藏目录）
│   └── manifest.yaml            # 自动发现的层级树，供机器快速读取
│
├── <layer-1>/                   # 第一层（示例：user/）
│   ├── LAYER.md                 # 层级描述 + 子层列表 + 机器解析块
│   ├── <sub-layer-1a>/          # 子层（示例：preferences/）
│   │   ├── LAYER.md
│   │   └── *.md                 # 具体记忆文件
│   └── *.md                     # 本层直接记忆（不归属任何子层的记忆）
│
├── <layer-2>/                   # 第二层（示例：project/）
│   ├── LAYER.md
│   ├── <sub-layer-2a>/
│   │   ├── LAYER.md
│   │   ├── <sub-sub-layer>/     # 更深子层（最多到第 5 层）
│   │   │   ├── LAYER.md
│   │   │   └── *.md
│   │   └── *.md
│   └── *.md
│
└── cross-layer/                 # 跨层关联记忆（复杂问题拆分后聚合）
    ├── .meta/
    │   └── index.yaml           # 跨层关联索引
    └── issue-001-integration.md # 聚合文件：引用多个层的子问题
```

### 2.2 命名规范

| 元素 | 命名规则 | 示例 |
|------|----------|------|
| 目录名（层名） | 小写，kebab-case，语义清晰 | `active-features`, `api-design`, `incident-2026-q1` |
| 记忆文件名 | 小写，kebab-case，描述性强 | `auth-rewrite-plan.md`, `performance-regression-0321.md` |
| LAYER.md | 固定文件名，每层必须 | `LAYER.md` |
| MEMORY.md | 固定文件名，仅在根目录 | `MEMORY.md` |
| cross-layer 文件 | 带前缀标识关联类型 | `issue-{NNN}-{topic}.md`, `decision-{NNN}-{topic}.md` |
| 隐藏元数据目录 | 以 `.` 开头 | `.hierarchy/`, `.meta/` |

### 2.3 目录深度建议

- **最大深度**：5 层（含根层）。超过 5 层时自动触发层级扁平化重构。
- **推荐深度**：3-4 层。此范围内召回效率最优（sideQuery 调用 3-4 次）。
- **叶子层文件数**：建议不超过 20 个。超过时自动提示或触发子层拆分。
- **每层子层数**：建议 3-6 个。过多子层会增加单步决策难度。

### 2.4 LAYER.md 混合格式

LAYER.md 采用**人类可读的 markdown + 机器可解析的 JSON 代码块**的混合格式：

```markdown
---
name: project
description: Project-related memories — ongoing work, goals, incidents, features
type: layer
created: 2026-05-01
updated: 2026-05-20
---

## Summary

Memories about ongoing and past project work: feature development, incidents,
architecture decisions, deadlines, and team coordination.

## Keywords

project, feature, roadmap, incident, bug, deadline, milestone, release,
architecture, decision, RFC, sprint, epic, blocker, rollback, deploy

## Sub-layers

- [active_features](./active_features) — Currently in-development features (3 files)
- [incidents](./incidents) — Production incidents and post-mortems (2 files)
- [architecture](./architecture) — Architecture decisions and tech specs (1 file)

<!-- machine-parsable block: 以下 JSON 块由自动化工具生成和维护 -->
```json:sublayers
[
  {
    "name": "active_features",
    "path": "./active_features",
    "summary": "Currently in-development features",
    "fileCount": 3,
    "keywords": ["auth", "migration", "perf"],
    "aliases": ["features", "in-progress"]
  },
  {
    "name": "incidents",
    "path": "./incidents",
    "summary": "Production incidents and post-mortems",
    "fileCount": 2,
    "keywords": ["outage", "postmortem", "rca"],
    "aliases": ["outages", "post-mortems"]
  }
]
```

## Statistics

```json:stats
{
  "totalFiles": 6,
  "typeBreakdown": { "project": 6 },
  "lastUpdated": "2026-05-18",
  "activeTopics": ["auth rewrite", "Q2 migration"],
  "averageFileAgeDays": 12
}
```

## Parent

[← Root](../MEMORY.md)
```

**格式规范**：
- `---` frontmatter 区：标准 YAML，包含基础元数据。
- `## Summary`：2-3 句话，描述该层的语义范围和共同主题。
- `## Keywords`：10-20 个关键词/标签，包含同义词，用于快速匹配。
- `## Sub-layers`：人类可读的列表 + `json:sublayers` 机器解析块。
- `## Statistics`：`json:stats` 块，提供量化信息辅助决策。
- `## Parent`：返回链接，便于人工浏览时导航。

**混合格式设计理由**：
1. `json:sublayers` 代码块使用 `json:sublayers` 语言标识，便于代码精确提取。
2. 人类可读的 markdown list 同时保留，供人工浏览和编辑。
3. 机器块由自动化工具生成和维护，人工编辑以人类可读部分为主。
4. 解析器优先读取机器块，回退到解析 markdown list。

### 2.5 MEMORY.md 根索引格式

```markdown
# Memory Index

This is the root index of the hierarchical memory system.

## Top-level Layers

- [user](./user) — User profile, preferences, and communication style
- [feedback](./feedback) — Feedback and guidance from the user
- [project](./project) — Ongoing work, goals, incidents, and features
- [reference](./reference) — External systems, dashboards, and resources

## Cross-layer Links

- [Issue #001: Frontend-Backend Integration](./cross-layer/issue-001-integration.md)

## Statistics

```json:root-stats
{
  "totalLayers": 4,
  "totalFiles": 42,
  "maxDepth": 3,
  "lastConsolidated": "2026-05-20T08:00:00Z"
}
```

---

*Last updated: 2026-05-20*
```

---

## 3. Frontmatter 扩展规范

在现有 `name/description/type` 基础上，HMF 引入以下扩展字段：

```yaml
---
name: auth-rewrite-plan                    # 标识符，kebab-case
description: Authentication module rewrite plan using OAuth2  # 一句话描述
type: reference | project | feedback | user | layer  # layer 为新增类型
created: 2026-05-21                        # ISO 8601 日期
updated: 2026-05-21                        # 最后修改日期
layer: "project/active-features/auth"      # 层级路径，从根开始
scope: single-layer | cross-layer | project-wide  # 影响范围
complexity: simple | complex               # 复杂度标记
status: active | resolved | deprecated     # 状态
related:                                   # 关联文件列表
  - "../backend/codegen/issue-003.md"
  - "../../reference/external-systems.md"
parents:                                   # 层级父节点
  - "../LAYER.md"
  - "../../LAYER.md"
---
```

### 3.1 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 标识符，同一层内唯一 |
| `description` | 是 | 一句话描述，用于召回时快速判断相关性 |
| `type` | 是 | 记忆类型；`layer` 专用于 LAYER.md |
| `created` | 否 | 创建日期，用于判断记忆新鲜度 |
| `updated` | 否 | 最后修改日期，autoDream 整合时更新 |
| `layer` | 否 | 层级路径，自动生成分层结构时填充 |
| `scope` | 否 | 影响范围：`single-layer`（单一层内）、`cross-layer`（跨层）、`project-wide`（全局） |
| `complexity` | 否 | `complex` 时触发拆分策略，详见第 6 节 |
| `status` | 否 | `deprecated` 的记忆在召回时降权 |
| `related` | 否 | 关联文件路径（相对路径），支持跨层关联 |
| `parents` | 否 | 指向父层 LAYER.md 的路径，用于层级导航和验证 |

### 3.2 type = layer 的特殊处理

`type: layer` 仅用于 LAYER.md 文件。解析器识别到此类型时：
- 将其视为层级元数据，而非普通记忆文件。
- 在召回时优先读取其 `json:sublayers` 块用于路径决策。
- 不将其作为候选记忆返回给最终用户（除非用户显式查询层级结构本身）。

---

## 4. 首次项目接触 — 自动分层发现流程

### 4.1 触发条件

自动分层发现（Auto-Discovery）在以下条件下触发：

1. **首次进入项目目录**：检测到 `.git` 存在但 `memory/` 目录不存在或为空。
2. **用户手动触发**：用户执行 `/init-memory` 或类似命令。
3. **结构重置**：用户执行 `/rebuild-memory-hierarchy` 强制重新生成分层。

### 4.2 扫描策略

自动发现采用三阶段扫描策略：

```
Phase A: 文件结构扫描
  └─ Glob 扫描项目根目录下的关键文件和目录
       ├─ 配置文件：package.json, Cargo.toml, pyproject.toml, go.mod, etc.
       ├─ 目录结构：src/, lib/, tests/, docs/, .github/, etc.
       ├─ 已有文档：README.md, ARCHITECTURE.md, RFCs/
       └─ 生成：项目文件树摘要（去噪后的关键路径列表）

Phase B: 关键配置读取
  └─ 读取检测到的配置文件，提取：
       ├─ 项目名称、描述、依赖关系
       ├─ 模块/包结构
       ├─ 技术栈信息
       └─ 生成：项目语义摘要

Phase C: 模型推理分层
  └─ sideQuery：输入项目摘要，输出建议的层级树
       ├─ 输入：项目文件树 + 语义摘要 + 默认层级模板
       ├─ 输出：JSON 格式的层级树建议
       └─ 约束：最多 5 层，每层 3-6 个子层
```

### 4.3 默认层级模板

模型推理时提供以下默认模板作为参考，但**不强制使用**——最终层级由项目特征决定：

```
默认模板（AI 编程助手场景）：
├── user/              # 用户相关
├── feedback/          # 反馈与指导
├── project/           # 项目工作
│   ├── architecture/  # 架构决策
│   ├── features/      # 功能开发
│   └── incidents/     # 问题与事故
└── reference/         # 外部参考
```

对于非编程场景（如知识库），模板可能调整为：
```
├── concepts/          # 核心概念
├── procedures/        # 操作流程
├── entities/          # 实体/对象
├── relationships/     # 关联关系
└── reference/         # 外部参考
```

### 4.4 生成的初始层级树

模型输出格式：

```json
{
  "hierarchy": {
    "name": "root",
    "description": "Root of the memory hierarchy",
    "layers": [
      {
        "name": "user",
        "description": "User preferences and profile",
        "suggestedFiles": ["role.md", "communication-style.md"]
      },
      {
        "name": "project",
        "description": "Project work and decisions",
        "subLayers": [
          {
            "name": "frontend",
            "description": "Frontend-related work",
            "subLayers": [
              { "name": "parser", "description": "Parser implementation" },
              { "name": "codegen", "description": "Code generation" }
            ]
          },
          { "name": "backend", "description": "Backend services" }
        ]
      }
    ]
  },
  "reasoning": "Based on the project's package.json which shows a compiler project..."
}
```

### 4.5 LAYER.md 自动生成

根据层级树自动为每层生成 LAYER.md：

1. 填充 frontmatter（`type: layer`, `name`, `description`）。
2. 生成 `## Summary`：基于子层名称和项目上下文生成描述。
3. 生成 `## Keywords`：从目录名、子层名中提取关键词。
4. 生成 `## Sub-layers`：人类可读列表 + `json:sublayers` 机器块。
5. 生成 `## Statistics`：初始值（totalFiles=0 等）。
6. 生成 `## Parent`：返回父层链接。

### 4.6 降级策略

如果自动分层发现失败或结果不合理，系统回退到扁平结构：

```typescript
async function autoDiscoverHierarchy(projectDir: string): Promise<boolean> {
  try {
    const tree = await generateHierarchyTree(projectDir)
    if (!tree || tree.layers.length === 0) {
      throw new Error('Empty hierarchy generated')
    }
    // 合理性检查：深度不超过 5，每层子层 2-8 个
    if (!validateHierarchy(tree)) {
      throw new Error('Hierarchy validation failed')
    }
    await writeHierarchyToDisk(tree)
    return true
  } catch (e) {
    // 降级：创建扁平结构
    logForDebugging('[hierarchical] Auto-discovery failed, falling back to flat', { error: e })
    await createFlatMemoryStructure(projectDir)
    return false
  }
}
```

**降级条件**：
- 模型返回无效 JSON 或空层级树。
- 层级深度超过 5 或某层子层数超过 10。
- 用户明确拒绝自动分层建议。
- 项目文件结构过于简单（< 10 个文件），无需分层。

---

## 5. 向下扩展联想召回算法

### 5.1 算法概览

召回算法采用四阶段流程，核心思想是"向下扩展联想"——从根层出发，逐层判断方向，只沿着高相关性的分支深入，最终在叶子层精选文件。

```
用户输入 query
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 0: 快速路径检测                                        │
│   - 检查 query 是否包含显式层名引用（如 "parser 层"）          │
│   - 检查 query 是否包含 LAYER.md 中定义的 aliases            │
│   - 若匹配，直接定位到该层路径，跳到 Phase 3                   │
│   - 若无匹配，继续 Phase 1                                    │
└─────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: 层级决策（单层评估）                                 │
│   - 读取当前层的 LAYER.md                                     │
│   - sideQuery：评估 query 与该层各子层的相关性（0-100）        │
│   - 返回：所有子层的相关性分数 + 决策理由                      │
└─────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: 递归向下（多分支保留）                               │
│   - 对 Phase 1 筛选出的高相关性子层，递归重复 Phase 1          │
│   - 每层可保留多个分支（歧义时保留 TOP_K 个）                 │
│   - 直到：到达叶子层 / 相关性低于阈值 / 达到最大深度           │
└─────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: 文件选择（叶子层内匹配）                             │
│   - 读取所有到达的叶子层内的记忆文件 frontmatter               │
│   - sideQuery：统一选择最相关的具体文件（最多 5 个）           │
│   - 去重、排序后返回                                         │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 核心参数

```typescript
const MAX_DEPTH = 5                    // 最大层级深度
const RELEVANCE_THRESHOLD = 40         // 继续向下的最低相关性分数
const TOP_K_BRANCHES = 2               // 每层最多保留的分支数
const MULTI_BRANCH_GAP = 15            // 多分支保留的分数差距阈值
const MAX_TOTAL_LEAVES = 4             // 最多探索的叶子层数量（防止分支爆炸）
const MAX_FILES_PER_LEAF = 20          // 叶子层超过此数量时提示拆分
```

### 5.3 终止条件

1. **到达叶子层**：当前层无子层（`sublayers.length === 0`）。
2. **深度限制**：当前深度 >= `MAX_DEPTH`。
3. **相关性不足**：所有子层的相关性分数 < `RELEVANCE_THRESHOLD`。
4. **信号中断**：`AbortSignal` 被触发。
5. **循环检测**：当前层路径已在 `visitedLayers` 中。
6. **叶子层上限**：已收集的叶子层数量 >= `MAX_TOTAL_LEAVES`。

### 5.4 多分支保留策略

当多个子层均表现出较高相关性时（常见于跨域问题），保留多个分支：

```typescript
function selectBranches(
  decisions: LayerDecision[],
  topK: number,
  gapThreshold: number,
): LayerDecision[] {
  const sorted = [...decisions].sort((a, b) => b.relevanceScore - a.relevanceScore)
  const selected: LayerDecision[] = [sorted[0]]

  for (let i = 1; i < sorted.length && selected.length < topK; i++) {
    const current = sorted[i]
    const topScore = sorted[0].relevanceScore
    const gap = topScore - current.relevanceScore

    // 保留条件：分数差距小（歧义情况）或分数绝对值高
    if (gap <= gapThreshold || current.relevanceScore >= RELEVANCE_THRESHOLD + 10) {
      selected.push(current)
    }
  }

  return selected
}
```

**示例**：
```
子层 A: 85 分
子层 B: 72 分 (gap = 13 <= 15)  → 保留
子层 C: 55 分 (gap = 30 > 15)   → 丢弃

搜索路径：根 → [A, B] → ...
```

### 5.5 跨层关联处理

跨层关联通过以下机制处理：

1. **`related` 字段**：记忆文件的 frontmatter 中声明跨层关联，召回时作为额外候选。
2. **`cross-layer/` 目录**：存放显式的跨层聚合文件（详见第 6 节）。
3. **关键词跨层标记**：在 LAYER.md 的 `keywords` 中添加跨域标签（如 `"integration"`, `"cross-team"`），帮助模型识别跨层场景。

当检测到跨层 query（如"前端和后端的集成"）：
- Phase 1 中 `frontend` 和 `backend` 子层可能均被保留。
- 搜索路径分裂为两条，各自向下探索。
- Phase 3 中从多个叶子层收集文件，统一去重排序。
- 同时检查 `cross-layer/` 中是否有匹配的聚合文件。

### 5.6 完整伪代码

```typescript
// ==================== 数据结构 ====================

interface LayerNode {
  path: string            // 目录绝对路径
  layerFile: string       // LAYER.md 绝对路径
  isLeaf: boolean         // 是否为叶子层
  children: LayerNode[]   // 子层节点
}

interface LayerDecision {
  layerPath: string       // 子层路径
  relevanceScore: number  // 0-100
  reasoning: string       // 决策理由（用于调试和可解释性）
}

interface HierarchicalRecallResult {
  memories: RelevantMemory[]
  searchPath: string[]     // 记录搜索路径
  layersVisited: number    // 访问的层数
  sideQueryCalls: number   // sideQuery 调用次数
  crossLayerMatches: string[] // 匹配的跨层文件
}

interface SearchContext {
  query: string
  memoryDir: string
  signal: AbortSignal
  recentTools: readonly string[]
  alreadySurfaced: ReadonlySet<string>
  visitedLayers: Set<string>
  searchPath: string[]
  sideQueryCalls: number
  leafCount: number        // 已收集的叶子层计数
}

// ==================== 主入口 ====================

async function findHierarchicalMemories(
  query: string,
  memoryDir: string,
  signal: AbortSignal,
  recentTools: readonly string[] = [],
  alreadySurfaced: ReadonlySet<string> = new Set(),
): Promise<HierarchicalRecallResult> {

  const ctx: SearchContext = {
    query, memoryDir, signal, recentTools, alreadySurfaced,
    visitedLayers: new Set(),
    searchPath: [],
    sideQueryCalls: 0,
    leafCount: 0,
  }

  // Phase 0: 快速路径
  const fastPath = await tryFastPath(ctx)
  if (fastPath) {
    const files = await selectFilesInLeafLayer(fastPath, ctx)
    const crossLayer = await checkCrossLayerFiles(ctx)
    return {
      memories: [...files, ...crossLayer],
      searchPath: ctx.searchPath,
      layersVisited: ctx.visitedLayers.size,
      sideQueryCalls: ctx.sideQueryCalls,
      crossLayerMatches: crossLayer.map(m => m.path),
    }
  }

  // Phase 1+2: 分层向下搜索
  const leafLayers = await traverseDown(ctx, memoryDir, /* depth */ 0)

  // 同时检查跨层关联
  const crossLayer = await checkCrossLayerFiles(ctx)

  // Phase 3: 在所有到达的叶子层中收集文件
  const allMemories: RelevantMemory[] = [...crossLayer]
  for (const leafPath of leafLayers) {
    const files = await selectFilesInLeafLayer(leafPath, ctx)
    allMemories.push(...files)
  }

  // 去重 + 截断到最多 5 个
  const unique = deduplicateByPath(allMemories)
  const top5 = rankAndSlice(unique, 5)

  return {
    memories: top5,
    searchPath: ctx.searchPath,
    layersVisited: ctx.visitedLayers.size,
    sideQueryCalls: ctx.sideQueryCalls,
    crossLayerMatches: crossLayer.map(m => m.path),
  }
}

// ==================== Phase 0: 快速路径 ====================

async function tryFastPath(ctx: SearchContext): Promise<string | null> {
  const rootLayer = await parseLayerFile(join(ctx.memoryDir, 'MEMORY.md'))
  if (!rootLayer) return null

  const lowerQuery = ctx.query.toLowerCase()

  // 检查根层列出的所有子层名和别名
  for (const sub of rootLayer.sublayers) {
    const names = [sub.name, ...(sub.aliases || [])]
    if (names.some(n => lowerQuery.includes(n.toLowerCase()))) {
      const targetPath = join(ctx.memoryDir, sub.path)
      ctx.searchPath.push(`FAST_PATH: matched "${sub.name}"`)
      return targetPath
    }
  }

  // 检查跨层目录中的索引
  const crossLayerMatch = await tryCrossLayerFastPath(ctx)
  if (crossLayerMatch) {
    ctx.searchPath.push(`FAST_PATH: cross-layer match "${crossLayerMatch}"`)
    return crossLayerMatch
  }

  return null
}

// ==================== Phase 1+2: 分层向下遍历 ====================

async function traverseDown(
  ctx: SearchContext,
  layerPath: string,
  depth: number,
): Promise<string[]> {

  if (ctx.signal.aborted) return []
  if (depth >= MAX_DEPTH) {
    ctx.searchPath.push(`DEPTH_LIMIT at ${layerPath}`)
    return [layerPath]
  }
  if (ctx.visitedLayers.has(layerPath)) return []
  if (ctx.leafCount >= MAX_TOTAL_LEAVES) return []

  ctx.visitedLayers.add(layerPath)
  ctx.searchPath.push(`VISIT: ${layerPath} (depth=${depth})`)

  const layerMeta = await parseLayerFile(join(layerPath, 'LAYER.md'))

  // 叶子层判定：无子层或无法解析 LAYER.md
  if (!layerMeta || layerMeta.sublayers.length === 0) {
    ctx.searchPath.push(`LEAF: ${layerPath}`)
    ctx.leafCount++
    return [layerPath]
  }

  // sideQuery：评估子层相关性
  const decisions = await evaluateSublayers(ctx, layerMeta)
  ctx.sideQueryCalls++

  const relevant = decisions.filter(d => d.relevanceScore >= RELEVANCE_THRESHOLD)

  if (relevant.length === 0) {
    ctx.searchPath.push(`PRUNE: no relevant sublayers at ${layerPath}`)
    // 宽入口策略：当前层本身可能有直接文件
    ctx.leafCount++
    return [layerPath]
  }

  const branches = selectBranches(relevant, TOP_K_BRANCHES, MULTI_BRANCH_GAP)

  ctx.searchPath.push(
    `BRANCH: ${layerPath} → [${branches.map(b => `${b.layerPath}(${b.relevanceScore})`).join(', ')}]`
  )

  const results: string[] = []
  for (const branch of branches) {
    const childResults = await traverseDown(ctx, branch.layerPath, depth + 1)
    results.push(...childResults)
  }

  return results
}

// ==================== Phase 3: 叶子层文件选择 ====================

async function selectFilesInLeafLayer(
  leafPath: string,
  ctx: SearchContext,
): Promise<RelevantMemory[]> {
  const headers = await scanMemoryFiles(leafPath, ctx.signal)
  const filtered = headers.filter(h =>
    !ctx.alreadySurfaced.has(h.filePath) &&
    !h.filePath.endsWith('LAYER.md')  // 排除层级元数据文件
  )

  if (filtered.length === 0) return []
  if (filtered.length <= 5) {
    return filtered.map(h => ({ path: h.filePath, mtimeMs: h.mtimeMs }))
  }

  const selected = await selectRelevantMemories(
    ctx.query, filtered, ctx.signal, ctx.recentTools,
  )
  ctx.sideQueryCalls++

  return selected
    .map(filename => {
      const h = filtered.find(f => f.filename === filename)
      return h ? { path: h.filePath, mtimeMs: h.mtimeMs } : null
    })
    .filter((m): m is RelevantMemory => m !== null)
}

// ==================== 跨层关联检查 ====================

async function checkCrossLayerFiles(ctx: SearchContext): Promise<RelevantMemory[]> {
  const crossLayerDir = join(ctx.memoryDir, 'cross-layer')
  try {
    const headers = await scanMemoryFiles(crossLayerDir, ctx.signal)
    if (headers.length === 0) return []

    const selected = await selectRelevantMemories(
      ctx.query, headers, ctx.signal, ctx.recentTools,
    )
    ctx.sideQueryCalls++

    return selected
      .map(filename => {
        const h = headers.find(f => f.filename === filename)
        return h ? { path: h.filePath, mtimeMs: h.mtimeMs } : null
      })
      .filter((m): m is RelevantMemory => m !== null)
  } catch {
    return []
  }
}
```

### 5.7 复杂度分析

**假设参数**：

| 参数 | 符号 | 典型值 |
|------|------|--------|
| 总记忆文件数 | N | 50-500 |
| 层级深度 | L | 3-5 |
| 每层平均子层数 | C | 3-6 |
| 每层实际探索的子层数 | K | 1-2（剪枝后） |
| 叶子层平均文件数 | M | 5-20 |

**对比**：

| 指标 | 扁平搜索 | 分层搜索 |
|------|----------|----------|
| 文件 IO | N 次 frontmatter 读取 | ~L 次 LAYER.md + K^L × M 次叶子 frontmatter |
| 典型值（N=200, L=4, K=2, M=10） | 200 次 | 4 + 40 = 44 次 |
| sideQuery 调用 | 1 次 | L 次层级决策 + 叶子选择 ≈ 4-6 次 |
| 单次 sideQuery prompt tokens | ~4K-8K（全部文件） | ~200-500（单层子层） |
| 总 input tokens | ~6,250 | ~4,700 |
| 延迟（串行 RTT ≈ 1s） | ~1s | ~4-5s |

---

## 6. 复杂问题拆分策略

### 6.1 拆分触发条件

当记忆的 `complexity: complex` 或满足以下任一条件时，触发拆分：

1. **内容跨越多层**：一个问题同时涉及 frontend、backend、infra 等多个领域。
2. **内容过长**：单文件超过 300 行或 5000 字（可读性阈值）。
3. **用户显式标注**：用户在记忆内容中包含 `#complex` 或 `#split` 标记。
4. **模型判断**：写入时 sideQuery 评估内容涉及多个独立子问题。

### 6.2 拆分粒度

每个子问题对应一个独立的记忆文件，存放到其最相关的层级：

```
原始复杂问题："重构编译器前端，涉及 parser、AST、类型检查"

拆分后：
├── project/
│   ├── frontend/
│   │   ├── LAYER.md
│   │   ├── parser/
│   │   │   ├── LAYER.md
│   │   │   └── refactor-parser-grammar.md    # 子问题 1
│   │   └── ast/
│   │       ├── LAYER.md
│   │       └── refactor-ast-nodes.md         # 子问题 2
│   └── type-system/
│       ├── LAYER.md
│       └── refactor-type-checking.md         # 子问题 3
│
└── cross-layer/
    └── issue-001-compiler-frontend-refactor.md  # 聚合文件
```

### 6.3 cross-layer 目录的使用

`cross-layer/` 是存放跨层聚合记忆的特殊目录：

1. **聚合文件**：汇总一个复杂问题在各层的子问题文件，提供全局视角。
2. **索引文件**：`.meta/index.yaml` 维护跨层关联的反向索引。
3. **召回时**：Phase 0 和 Phase 3 同时检查 cross-layer 目录。

**聚合文件格式**：

```markdown
---
name: compiler-frontend-refactor
description: Compiler frontend refactoring — umbrella issue
type: project
scope: cross-layer
complexity: complex
status: active
related:
  - "../project/frontend/parser/refactor-parser-grammar.md"
  - "../project/frontend/ast/refactor-ast-nodes.md"
  - "../project/type-system/refactor-type-checking.md"
---

## Overview

This is a cross-layer aggregation of the compiler frontend refactoring effort.

## Sub-issues

1. [Parser grammar update](../project/frontend/parser/refactor-parser-grammar.md)
2. [AST node restructuring](../project/frontend/ast/refactor-ast-nodes.md)
3. [Type checking integration](../project/type-system/refactor-type-checking.md)

## Status

- Parser: In progress
- AST: Pending
- Type checking: Not started
```

### 6.4 关联维护

跨层关联通过以下机制维护：

1. **`related` frontmatter 字段**：每个子问题文件指向聚合文件，聚合文件反向指向所有子问题。
2. **LAYER.md 更新**：涉及跨层时，在相关层的 LAYER.md 中添加 `crossLayerRefs` 字段。
3. **自动检测**：定期扫描所有记忆的 `related` 字段，发现跨层关联模式，自动生成或更新聚合文件。

---

## 7. 定期整合策略

### 7.1 autoDream 四阶段整合适配

autoDream 的定期记忆整合流程适配分层结构如下：

```
Phase 1: 扫描与收集
  └─ 变更：按层级扫描，优先收集最近修改的叶子层
       ├─ 利用 .hierarchy/manifest.yaml 快速定位活跃层级
       ├─ 根据 mtime 排序，只扫描变更的叶子层
       └─ 收集新增/修改/删除的记忆文件列表

Phase 2: 内容分析与去重
  └─ 变更：在叶子层内去重，跨层时检查聚合文件
       ├─ 单一层内：检测相似描述的记忆，合并或标记
       ├─ 跨层时：检查 cross-layer/ 是否已有聚合，避免重复创建
       └─ 更新各 LAYER.md 的 Statistics 块

Phase 3: 摘要生成
  └─ 变更：按层级生成摘要，更新 LAYER.md
       ├─ 为每个有变更的叶子层生成新的 Summary
       ├─ 更新 Keywords（提取新增记忆的关键词并合并）
       ├─ 更新 Statistics（文件数、类型分布、最近活跃主题）
       └─ 向上传播：父层的 Summary 和 Keywords 也同步更新

Phase 4: 索引更新与清理
  └─ 变更：更新层级元数据，清理失效关联
       ├─ 更新 .hierarchy/manifest.yaml
       ├─ 检查并修复 broken `related` 链接
       ├─ 标记 `status: deprecated` 的过期记忆
       └─ 触发层级重构评估（见 7.2）
```

### 7.2 层级重构触发条件

以下情况触发层级结构自动重构评估：

| 条件 | 阈值 | 动作 |
|------|------|------|
| 某层文件数过多 | > 30 个 | 提示或自动拆分子层 |
| 某层深度过深 | > 5 层 | 扁平化深层子层 |
| 新增大量文件 | 单次整合新增 > 10 个 | 重新评估该层子层结构 |
| 跨层关联激增 | 新增 > 5 个 cross-layer 关联 | 考虑创建新的中间层或调整结构 |
| 层级利用率不均 | 某子层文件数 /  sibling 平均 > 3x | 提示重新平衡 |
| LAYER.md 过期 | 超过 30 天未更新 | 强制更新该层及父层 |

### 7.3 LAYER.md 自动更新

LAYER.md 的自动更新遵循以下规则：

1. **增量更新**：仅当该层有文件变更时才更新，避免全量重写。
2. **向上传播**：叶子层更新后，其父层的 `json:stats` 和子层摘要也同步更新。
3. **关键词合并**：合并所有子层的关键词，去重后保留高频词。
4. **人工编辑保护**：如果检测到 LAYER.md 有人工编辑痕迹（非工具生成的格式），标记为 `manual: true`，自动更新时跳过或提示确认。

---

## 8. 实施路线图

### Phase 1: 基础设施与类型扩展（2 周）

**目标**：建立分层结构所需的基础模块，不触碰现有搜索逻辑。

**涉及文件**：
- `src/memdir/memoryTypes.ts` — 扩展 MemoryType、新增 LayerMetadata 类型
- `src/memdir/layerParser.ts` — 新增 LAYER.md 解析器
- `src/memdir/hierarchyManifest.ts` — 新增 manifest.yaml 读写

**改动概要**：
1. `memoryTypes.ts`：添加 `'layer'` 到 MemoryType，新增 `LayerMetadata`、`SublayerRef`、`LayerStats` 接口。
2. `layerParser.ts`：实现 `parseLayerFile()` — 解析 frontmatter + 提取 `json:sublayers` / `json:stats` 块。
3. `hierarchyManifest.ts`：实现 `loadManifest()` / `saveManifest()` — 读写 `.hierarchy/manifest.yaml`。

**验收标准**：
- [ ] `parseLayerFile()` 能正确解析含混合格式的 LAYER.md。
- [ ] 解析失败时返回 null，不抛异常。
- [ ] manifest 读写完整且格式正确。
- [ ] 现有扁平搜索不受影响（100% 向后兼容）。

---

### Phase 2: 分层搜索模块（2 周）

**目标**：实现完整的 `findHierarchicalMemories`，支持四阶段召回。

**涉及文件**：
- `src/memdir/findHierarchicalMemories.ts` — 新增分层搜索主模块
- `src/memdir/prompts/layerSelectionPrompt.ts` — 新增层级决策 prompt
- `src/memdir/crossLayer.ts` — 新增跨层关联处理

**改动概要**：
1. `findHierarchicalMemories.ts`：实现 Phase 0-3 完整逻辑，含快速路径、层级决策、递归向下、叶子文件选择。
2. `layerSelectionPrompt.ts`：定义 `LAYER_SELECTION_SYSTEM_PROMPT` 和 JSON schema。
3. `crossLayer.ts`：实现 `checkCrossLayerFiles()` 和跨层索引维护。

**验收标准**：
- [ ] 分层搜索能正确遍历示例层级结构并返回相关记忆。
- [ ] Phase 0 快速路径命中时跳过层级决策，直接定位。
- [ ] 多分支歧义时正确保留多个路径。
- [ ] 跨层关联文件被正确召回。
- [ ] AbortSignal 能立即终止搜索。
- [ ] 所有边界情况（缺失 LAYER.md、循环引用、深度限制）均有测试覆盖。

---

### Phase 3: 集成与 feature flag（1 周）

**目标**：通过 feature flag 将分层搜索接入现有系统，支持 A/B 对比。

**涉及文件**：
- `src/memdir/memdir.ts` — 新增统一入口和 feature flag 判断
- `src/config/features.ts` — 新增 `MEMORY_HIERARCHICAL_RECALL` flag

**改动概要**：
1. `features.ts`：新增 feature flag `MEMORY_HIERARCHICAL_RECALL`，默认 `false`。
2. `memdir.ts`：新增 `findMemories()` 统一入口，检测 `LAYER.md` 存在性，按 flag 路由到分层或扁平搜索。
3. 降级逻辑：分层搜索异常时自动回退到 `findRelevantMemories`。

**验收标准**：
- [ ] flag 关闭时，100% 走原有扁平搜索路径。
- [ ] flag 开启且存在 `LAYER.md` 时，走分层搜索。
- [ ] flag 开启但无 `LAYER.md` 时，自动回退扁平搜索。
- [ ] 分层搜索异常时，降级到扁平搜索并记录日志。
- [ ] 两种路径返回的数据结构一致。

---

### Phase 4: 自动发现与定期整合（2 周）

**目标**：实现自动分层发现、autoDream 适配、层级重构。

**涉及文件**：
- `src/memdir/autoDiscover.ts` — 新增自动分层发现
- `src/memdir/layerGenerator.ts` — 新增 LAYER.md 自动生成
- `src/autoDream/consolidationPrompt.ts` — 修改适配分层结构
- `src/memdir/hierarchyRebalancer.ts` — 新增层级重构评估

**改动概要**：
1. `autoDiscover.ts`：实现三阶段扫描 + 模型推理 + 层级树生成。
2. `layerGenerator.ts`：根据层级树为每层生成 LAYER.md。
3. `consolidationPrompt.ts`：修改 autoDream 的 4 阶段流程，支持按层级扫描和更新。
4. `hierarchyRebalancer.ts`：实现重构触发条件检测和自动重构。

**验收标准**：
- [ ] 首次进入新项目时，能自动生成分层结构和 LAYER.md。
- [ ] autoDream 整合时正确更新各层 LAYER.md。
- [ ] 触发重构条件时，正确评估并执行层级调整。
- [ ] 降级策略工作正常：无法推断层级时回退到扁平。
- [ ] 端到端测试通过：从空目录到完整分层记忆的完整生命周期。

---

## 9. 风险与 Trade-off

### 9.1 延迟增加

**风险**：分层搜索需要多次串行 sideQuery 调用，延迟从 ~1s 增加到 ~4-5s。

**缓解策略**：
1. **Phase 0 快速路径**：常见查询可直接定位，跳过层级遍历。
2. **缓存 LAYER.md 解析结果**：在会话内缓存已解析的层级元数据。
3. **并行叶子层选择**：Phase 3 中多个叶子层的文件选择可并行执行。
4. **预加载**：在会话开始时异步预加载层级结构到内存。

### 9.2 sideQuery 成本增加

**风险**：sideQuery 调用从 1 次增加到 ~6 次，API 调用次数上升。

**缓解策略**：
1. 虽然调用次数增加，但每次调用的 token 量大幅减少（500 vs 6000），总 token 消耗反而更低。
2. 小型层级（< 50 个文件）可保持扁平搜索，不分层。
3. 层级决策 sideQuery 可使用更快、更便宜的模型（如 Haiku）。

### 9.3 层级维护开销

**风险**：LAYER.md 需要持续维护，否则层级信息过时导致召回质量下降。

**缓解策略**：
1. **自动化工具**：autoDream 整合时自动更新 LAYER.md。
2. **人工编辑保护**：检测到人工编辑时标记，避免覆盖。
3. **定期健康检查**：每周扫描一次，检测过期的 LAYER.md 并提示更新。

### 9.4 自动分层不准确

**风险**：自动发现生成的层级结构可能不符合用户预期，导致记忆存放位置不合理。

**缓解策略**：
1. **用户确认**：自动生成的层级树先展示给用户，确认后再写入。
2. **渐进式调整**：允许用户随时手动移动文件、重命名目录，工具自动同步 LAYER.md。
3. **反馈循环**：记录用户的手动调整模式，用于改进自动发现算法。
4. **扁平降级**：用户可随时执行 `/rebuild-memory-hierarchy --flat` 回退。

### 9.5 向后兼容性

**风险**：已有用户的扁平记忆目录无法直接使用新功能。

**缓解策略**：
1. **自动检测**：存在 `LAYER.md` 才启用分层，否则保持扁平。
2. **迁移脚本**：Phase 4 提供 `migrate-to-hierarchy` 命令，将现有扁平记忆转换为分层结构（基于 `type` 字段自动归类到顶层）。
3. **无侵入**：不修改 `findRelevantMemories.ts`，现有用户升级无感知。

---

## 附录 A：术语表

| 术语 | 定义 |
|------|------|
| HMF | Hierarchical Memory Framework，通用分层记忆框架 |
| LAYER.md | 层级描述文件，每层一个，包含混合格式元数据 |
| MEMORY.md | 根索引文件，顶层 LAYER 列表 |
| 叶子层 | 无子层的层级，直接包含记忆文件 |
| 向下扩展联想 | 从根层出发，逐层判断相关性并向下深入的路径搜索策略 |
| Auto-Discovery | 首次接触项目时自动扫描和推断层级结构的过程 |
| Cross-layer | 涉及多个层级的记忆关联 |
| 混合格式 | markdown 人类可读内容 + JSON 机器解析块的复合格式 |
