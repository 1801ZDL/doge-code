# 向下扩展联想搜索算法设计文档

> 目标：将记忆召回从 O(N) 扁平扫描优化为 O(L × sideQuery_cost) 分层向下搜索，其中 L 为层级深度（通常 3-5）。

---

## 1. 现有架构分析

### 1.1 当前扁平化搜索流程

```
findRelevantMemories(query, memoryDir)
  └─ scanMemoryFiles(memoryDir)          // 递归读取所有 .md 文件
       ├─ readdir(memoryDir, recursive)   // 获取全部文件列表
       ├─ 对每个 .md 读取 frontmatter     // name, description, type
       └─ 返回 MemoryHeader[] (最多 200 个)
  └─ selectRelevantMemories(query, headers)
       └─ sideQuery(一次性传入全部 headers) // 选择最多 5 个
```

**问题**：
- `scanMemoryFiles` 读取所有文件 frontmatter，当记忆数量增长时，IO 和 token 消耗线性增长
- `selectRelevantMemories` 的 prompt 中包含全部文件列表，token 随 N 增长
- 无法利用记忆的语义分组（user/feedback/project/reference 天然就是分类）

### 1.2 关键现有接口

```typescript
// sideQuery 签名（已有）
async function sideQuery(opts: {
  model: string
  system?: string
  messages: MessageParam[]
  output_format?: BetaJSONOutputFormat   // JSON schema 输出
  max_tokens?: number
  signal?: AbortSignal
  querySource: QuerySource
}): Promise<BetaMessage>

// MemoryHeader（已有）
type MemoryHeader = {
  filename: string      // 相对路径
  filePath: string      // 绝对路径
  mtimeMs: number
  description: string | null
  type: MemoryType | undefined
}
```

---

## 2. 分层记忆存储结构

### 2.1 目录树结构

```
memory/
├── MEMORY.md                 // 根索引：顶层 LAYER 列表
├── LAYER.md                  // 根层的元数据（可选，描述整体结构）
│
├── user/                     // 顶层：user 类记忆
│   ├── LAYER.md              // 该层的元数据
│   ├── role.md
│   └── preferences.md
│
├── feedback/                 // 顶层：feedback 类记忆
│   ├── LAYER.md
│   ├── testing_policy.md
│   └── communication_style.md
│
├── project/                  // 顶层：project 类记忆
│   ├── LAYER.md
│   ├── active_features/      // 子层
│   │   ├── LAYER.md
│   │   ├── auth_rewrite.md
│   │   └── migration_q2.md
│   └── incidents/            // 子层
│       ├── LAYER.md
│       └── outage_2026_03.md
│
└── reference/                // 顶层：reference 类记忆
    ├── LAYER.md
    ├── external_systems.md
    └── dashboards.md
```

### 2.2 核心原则

- **每层一个 `LAYER.md`**：描述该层的语义范围、子层列表、本层文件概况
- **根 `MEMORY.md`**：仅作为顶层 LAYER 的索引（保持向后兼容）
- **子层是目录**：子目录代表更细粒度的语义分区
- **叶子层**：没有子目录的层，直接包含记忆文件

---

## 3. 两阶段召回算法

### 3.1 算法概览

```
用户输入 query
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 0: 快速路径检测                                        │
│   - 检查 query 是否包含明确的层名引用（如 "parser层"）          │
│   - 若有，直接定位到该层，跳到 Phase 3                         │
│   - 若无，继续 Phase 1                                        │
└─────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: 层级选择（广度优先，单层决策）                        │
│   - 读取当前层的 LAYER.md                                     │
│   - sideQuery：评估 query 与该层及其子层的相关性               │
│   - 返回：最相关的子层列表（可多个）+ 相关性分数               │
└─────────────────────────────────────────────────────────────┘
  │
  ▼ (递归)
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: 向下扩展（深度优先，逐层决策）                        │
│   - 对每个被选中的子层，重复 Phase 1                          │
│   - 直到：叶子层 / 相关性低于阈值 / 达到最大深度               │
└─────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: 文件选择（叶子层内匹配）                              │
│   - 读取叶子层内所有记忆文件的 frontmatter                     │
│   - sideQuery：选择最相关的具体文件（最多 5 个）               │
│   - 或直接复用现有 selectRelevantMemories 逻辑               │
└─────────────────────────────────────────────────────────────┘
  │
  ▼
返回：RelevantMemory[]（去重、按相关性排序）
```

### 3.2 详细算法伪代码

```typescript
// ==================== 数据结构 ====================

interface LayerNode {
  path: string           // 目录绝对路径
  layerFile: string      // LAYER.md 绝对路径
  isLeaf: boolean        // 是否为叶子层（无子目录）
  children: LayerNode[]  // 子层节点
}

interface LayerDecision {
  layerPath: string      // 子层路径
  relevanceScore: number // 0-100
  reasoning: string      // 决策理由（用于调试和可解释性）
}

interface HierarchicalRecallResult {
  memories: RelevantMemory[]
  searchPath: string[]    // 记录搜索路径（用于调试）
  layersVisited: number   // 访问的层数
  sideQueryCalls: number  // sideQuery 调用次数
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
    query,
    memoryDir,
    signal,
    recentTools,
    alreadySurfaced,
    visitedLayers: new Set(),
    searchPath: [],
    sideQueryCalls: 0,
  }

  // Phase 0: 快速路径 — 检测 query 中的显式层名引用
  const fastPath = await tryFastPath(ctx)
  if (fastPath) {
    const files = await selectFilesInLeafLayer(fastPath, ctx)
    return {
      memories: files,
      searchPath: ctx.searchPath,
      layersVisited: ctx.visitedLayers.size,
      sideQueryCalls: ctx.sideQueryCalls,
    }
  }

  // Phase 1+2: 分层向下搜索
  const leafLayers = await traverseDown(ctx, memoryDir, /* depth */ 0)

  // Phase 3: 在所有到达的叶子层中收集文件
  const allMemories: RelevantMemory[] = []
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
  }
}

// ==================== Phase 0: 快速路径 ====================

async function tryFastPath(ctx: SearchContext): Promise<string | null> {
  // 读取根 LAYER.md 获取所有层名
  const rootLayer = await parseLayerFile(join(ctx.memoryDir, 'LAYER.md'))
  if (!rootLayer) return null

  // 在 query 中搜索是否包含任何子层名称
  const lowerQuery = ctx.query.toLowerCase()
  for (const sub of rootLayer.sublayers) {
    const names = [sub.name, ...(sub.aliases || [])]
    if (names.some(n => lowerQuery.includes(n.toLowerCase()))) {
      const targetPath = join(ctx.memoryDir, sub.path)
      ctx.searchPath.push(`FAST_PATH: matched "${sub.name}"`)
      return targetPath
    }
  }
  return null
}

// ==================== Phase 1+2: 分层向下遍历 ====================

const MAX_DEPTH = 5
const RELEVANCE_THRESHOLD = 40       // 继续向下的最低相关性
const TOP_K_BRANCHES = 2             // 每层最多保留的分支数
const MULTI_BRANCH_GAP = 15          // 如果两个分支分数差距小于此值，保留两者

async function traverseDown(
  ctx: SearchContext,
  layerPath: string,
  depth: number,
): Promise<string[]> {

  // 终止条件
  if (ctx.signal.aborted) return []
  if (depth >= MAX_DEPTH) {
    ctx.searchPath.push(`DEPTH_LIMIT at ${layerPath}`)
    return [layerPath]
  }
  if (ctx.visitedLayers.has(layerPath)) return []
  ctx.visitedLayers.add(layerPath)
  ctx.searchPath.push(`VISIT: ${layerPath} (depth=${depth})`)

  // 读取当前层 LAYER.md
  const layerMeta = await parseLayerFile(join(layerPath, 'LAYER.md'))

  // 如果是叶子层（无子层），返回该层路径
  if (!layerMeta || layerMeta.sublayers.length === 0) {
    ctx.searchPath.push(`LEAF: ${layerPath}`)
    return [layerPath]
  }

  // sideQuery：决策哪些子层最相关
  const decisions = await evaluateSublayers(ctx, layerMeta)
  ctx.sideQueryCalls++

  // 过滤低相关性分支
  const relevant = decisions.filter(d => d.relevanceScore >= RELEVANCE_THRESHOLD)

  if (relevant.length === 0) {
    ctx.searchPath.push(`PRUNE: no relevant sublayers at ${layerPath}`)
    // 如果当前层本身有文件，将该层作为叶子返回（宽入口策略）
    return [layerPath]
  }

  // 多分支决策：保留高相关性分支
  const branches = selectBranches(relevant, TOP_K_BRANCHES, MULTI_BRANCH_GAP)

  ctx.searchPath.push(
    `BRANCH: ${layerPath} → [${branches.map(b => `${b.layerPath}(${b.relevanceScore})`).join(', ')}]`
  )

  // 递归遍历每个选中的分支
  const results: string[] = []
  for (const branch of branches) {
    const childResults = await traverseDown(ctx, branch.layerPath, depth + 1)
    results.push(...childResults)
  }

  return results
}

// 多分支选择策略
function selectBranches(
  decisions: LayerDecision[],
  topK: number,
  gapThreshold: number,
): LayerDecision[] {
  // 按分数降序排序
  const sorted = [...decisions].sort((a, b) => b.relevanceScore - a.relevanceScore)

  const selected: LayerDecision[] = [sorted[0]]

  for (let i = 1; i < sorted.length && selected.length < topK; i++) {
    const current = sorted[i]
    const topScore = sorted[0].relevanceScore

    // 保留条件：分数差距小（歧义情况，保留多路径）
    // 或者分数仍然较高（≥ 阈值 + 10）
    const gap = topScore - current.relevanceScore
    if (gap <= gapThreshold || current.relevanceScore >= RELEVANCE_THRESHOLD + 10) {
      selected.push(current)
    }
  }

  return selected
}

// ==================== Phase 3: 叶子层文件选择 ====================

async function selectFilesInLeafLayer(
  leafPath: string,
  ctx: SearchContext,
): Promise<RelevantMemory[]> {
  // 复用现有的扁平选择逻辑，但限制在单个叶子层内
  const headers = await scanMemoryFiles(leafPath, ctx.signal)
  const filtered = headers.filter(h => !ctx.alreadySurfaced.has(h.filePath))

  if (filtered.length === 0) return []
  if (filtered.length <= 5) {
    return filtered.map(h => ({ path: h.filePath, mtimeMs: h.mtimeMs }))
  }

  // 数量多时，用 sideQuery 精选
  const selected = await selectRelevantMemories(
    ctx.query,
    filtered,
    ctx.signal,
    ctx.recentTools,
  )
  ctx.sideQueryCalls++

  return selected
    .map(filename => {
      const h = filtered.find(f => f.filename === filename)
      return h ? { path: h.filePath, mtimeMs: h.mtimeMs } : null
    })
    .filter((m): m is RelevantMemory => m !== null)
}
```

---

## 4. Prompt 模板设计

### 4.1 Phase 1+2: 层级决策 sideQuery Prompt

```typescript
const LAYER_SELECTION_SYSTEM_PROMPT = `You are a memory routing classifier. Your job is to determine which sub-layer(s) of a hierarchical memory system are most relevant to a user's query.

You will be given:
1. The user's query
2. The current layer's context (summary, keywords)
3. A list of available sub-layers with their summaries and keywords

For each sub-layer, assign a relevance score (0-100):
- 80-100: Highly relevant — the query directly matches this sub-layer's domain
- 60-79: Relevant — the query is related to this sub-layer's topics
- 40-59: Marginally relevant — weak connection, may contain tangential info
- 0-39: Not relevant — no meaningful connection

Be precise. A score of 50+ means "this sub-layer likely contains memories useful for answering the query."

Respond in the specified JSON format.`

const LAYER_SELECTION_SCHEMA = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sublayer_name: { type: 'string' },
          relevance_score: { type: 'number', minimum: 0, maximum: 100 },
          reasoning: { type: 'string' },
        },
        required: ['sublayer_name', 'relevance_score', 'reasoning'],
      },
    },
    should_stop: {
      type: 'boolean',
      description: 'True if none of the sub-layers are relevant enough to continue searching deeper.',
    },
  },
  required: ['decisions', 'should_stop'],
}

// User message template
function buildLayerSelectionUserMessage(
  query: string,
  layerMeta: LayerMetadata,
): string {
  const sublayersList = layerMeta.sublayers
    .map(s => `- **${s.name}** (${s.memoryCount} files)\n  Summary: ${s.summary}\n  Keywords: ${s.keywords.join(', ')}`)
    .join('\n\n')

  return `User query: "${query}"

Current layer: ${layerMeta.name}
Summary: ${layerMeta.summary}
Keywords: ${layerMeta.keywords.join(', ')}

Available sub-layers:
${sublayersList}

Evaluate each sub-layer's relevance to the query. Return your assessment in the required JSON format.`
}
```

### 4.2 Phase 0: 快速路径检测（无需 sideQuery，纯文本匹配）

```typescript
// 在 LAYER.md 中定义层名的多种叫法
// sublayer.aliases 字段支持同义词匹配

function detectLayerReference(query: string, layerMeta: LayerMetadata): string | null {
  const normalized = query.toLowerCase()
  for (const sub of layerMeta.sublayers) {
    const allNames = [sub.name, ...(sub.aliases || [])].map(n => n.toLowerCase())
    if (allNames.some(name => normalized.includes(name))) {
      return sub.path
    }
  }
  return null
}
```

### 4.3 Phase 3: 叶子层文件选择 Prompt（复用现有）

复用 `findRelevantMemories.ts` 中已有的 `SELECT_MEMORIES_SYSTEM_PROMPT`，只是输入范围缩小到单个叶子层内的文件。

---

## 5. LAYER.md 元数据设计

### 5.1 完整模板

```markdown
---
name: {{layer name}}
description: {{one-line description — used by parent layer's index, so be specific}}
type: layer
---

## Summary

{{2-3 sentences describing what memories live in this layer and their common theme.}}

## Keywords

{{10-20 keywords/tags covering the semantic range of this layer. Include synonyms.}}

## Sub-layers

{{#if has_sub_layers}}
- [{{sub1_name}}]({{sub1_path}}) — {{one-line summary}} ({{file_count}} files)
- [{{sub2_name}}]({{sub2_path}}) — {{one-line summary}} ({{file_count}} files)
{{/if}}

## Memories in this layer

{{#if is_leaf}}
- [{{memory1_name}}]({{memory1_path}}) — {{description}}
- [{{memory2_name}}]({{memory2_path}}) — {{description}}
{{else}}
_This layer contains only sub-directories, no direct memory files._
{{/if}}

## Statistics

- **Total memory files**: {{count}}
- **Types breakdown**: {{type_counts}}
- **Last updated**: {{last_update_date}}
- **Active topics** (from recent file mtimes): {{recent_topics}}

## Parent

[← {{parent_name}}]({{parent_path}})
```

### 5.2 机器解析格式（frontmatter + 结构化 sections）

为了便于代码解析，LAYER.md 采用**混合格式**：

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

<!-- machine-parsable block -->
```json:sublayers
[
  { "name": "active_features", "path": "./active_features", "summary": "Currently in-development features", "fileCount": 3, "keywords": ["auth", "migration", "perf"] },
  { "name": "incidents", "path": "./incidents", "summary": "Production incidents and post-mortems", "fileCount": 2, "keywords": ["outage", "postmortem", "rca"] },
  { "name": "architecture", "path": "./architecture", "summary": "Architecture decisions and tech specs", "fileCount": 1, "keywords": ["adr", "rfc", "design"] }
]
```

## Statistics

```json:stats
{
  "totalFiles": 6,
  "typeBreakdown": { "project": 6 },
  "lastUpdated": "2026-05-18",
  "activeTopics": ["auth rewrite", "Q2 migration"]
}
```

## Parent

[← Root](../MEMORY.md)
```

**设计理由**：
- `## Sub-layers` 中的 `json:sublayers` 代码块是机器可读格式，避免手写正则解析 markdown list
- 人类可读的 markdown list 同时保留，供人工浏览
- `json:stats` 提供量化信息帮助快速决策
- 使用 `type: layer` frontmatter 区分 LAYER.md 和普通记忆文件

### 5.3 TypeScript 解析类型

```typescript
interface SublayerRef {
  name: string           // 目录名（也是人类可读的层名）
  path: string           // 相对路径（如 "./active_features"）
  summary: string        // 一句话摘要
  fileCount: number      // 该子层下的文件数量
  keywords: string[]     // 子层关键词
}

interface LayerStats {
  totalFiles: number
  typeBreakdown: Record<string, number>
  lastUpdated: string    // ISO date
  activeTopics: string[] // 最近活跃的主题
}

interface LayerMetadata {
  name: string
  description: string
  summary: string
  keywords: string[]
  sublayers: SublayerRef[]
  stats: LayerStats
  parentPath: string | null
}
```

---

## 6. 与现有代码的集成方案

### 6.1 推荐方案：新建模块 + 兼容层

```
src/memdir/
├── findRelevantMemories.ts      // 现有：扁平搜索（保留不变）
├── findHierarchicalMemories.ts  // 新增：分层搜索
├── layerParser.ts               // 新增：LAYER.md 解析器
├── memoryScan.ts                // 现有（微调：支持叶子层局部扫描）
└── memoryTypes.ts               // 现有（微调：添加 'layer' type）
```

**不修改 `findRelevantMemories.ts` 的原因**：
1. 向后兼容：旧版无分层结构的 memory 目录仍能工作
2. A/B 测试：可通过 feature flag 切换两种策略
3. 降级策略：分层搜索失败时自动回退到扁平搜索

### 6.2 入口点设计

```typescript
// src/memdir/findHierarchicalMemories.ts

export async function findHierarchicalMemories(...): Promise<RelevantMemory[]>

// feature flag 控制是否启用分层搜索
const ENABLE_HIERARCHICAL = feature('MEMORY_HIERARCHICAL_RECALL')

// 在 memdir.ts（或调用方）中统一入口
export async function findMemories(query, memoryDir, signal, ...args) {
  if (ENABLE_HIERARCHICAL && await hasHierarchicalStructure(memoryDir)) {
    try {
      return await findHierarchicalMemories(query, memoryDir, signal, ...args)
    } catch (e) {
      // 降级到扁平搜索
      return await findRelevantMemories(query, memoryDir, signal, ...args)
    }
  }
  return await findRelevantMemories(query, memoryDir, signal, ...args)
}

// 检测是否有分层结构：检查是否存在 LAYER.md
async function hasHierarchicalStructure(memoryDir: string): Promise<boolean> {
  try {
    await access(join(memoryDir, 'LAYER.md'))
    return true
  } catch {
    return false
  }
}
```

### 6.3 为什么不用 forked agent

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| **内联多轮逻辑**（推荐） | 单进程，状态可控，延迟最低 | 代码复杂度略高 | ✅ 采用 |
| **forked agent** | 隔离性好 | 额外进程开销、agent 编排复杂、不适合同步召回 | ❌ 不采用 |
| **修改现有模块** | 改动集中 | 破坏向后兼容、风险高 | ❌ 不采用 |

召回是**同步阻塞操作**（主模型等待记忆结果），forked agent 的异步/多进程模型不适合此场景。

---

## 7. 边界情况处理

### 7.1 叶子层（无子层）

**行为**：直接跳到 Phase 3，扫描该层内所有文件并用 sideQuery 选择。

```typescript
if (layerMeta.sublayers.length === 0) {
  return [layerPath]  // 作为叶子层返回
}
```

### 7.2 多个子层相关性接近（歧义情况）

**策略**：`MULTI_BRANCH_GAP = 15`

```
子层A: 85分
子层B: 72分 (gap=13 ≤ 15) → 保留
子层C: 55分 (gap=30 > 15) → 丢弃

搜索路径：根 → [A, B] → ...
```

**跨层关联处理**：
- 如果用户 query 明确涉及多个领域（"前端和后端的集成"），两个分支都会被保留
- 最终从多个叶子层收集文件后统一去重排序
- 如果跨层关联频繁出现，可在 LAYER.md 的 `keywords` 中添加跨层标签（如 "integration", "cross-team"）

### 7.3 显式层名引用（快速路径）

```typescript
// Query: "parser层最近有什么更新？"
// → 检测到 "parser" 匹配子层名
// → 跳过上层搜索，直接定位到 project/parser/
// → 从该层开始向下搜索或直接进入文件选择
```

### 7.4 某层 LAYER.md 缺失或损坏

```typescript
// 降级：将该层视为叶子层，直接扫描文件
// 同时记录警告日志，提示用户修复 LAYER.md
async function parseLayerFile(path: string): Promise<LayerMetadata | null> {
  try {
    return await parseLayerFileInternal(path)
  } catch (e) {
    logForDebugging(`[hierarchical] Failed to parse ${path}, treating as leaf`, { level: 'warn' })
    return null  // null 表示叶子层
  }
}
```

### 7.5 所有子层相关性都低于阈值

**行为**：返回当前层作为叶子层（宽入口策略），在当前层内搜索文件。

理由：避免过度剪枝导致漏召回。如果当前层本身包含文件，这些文件可能仍然相关。

### 7.6 循环引用检测

```typescript
const visitedLayers = new Set<string>()

if (visitedLayers.has(layerPath)) {
  return []  // 防止循环
}
visitedLayers.add(layerPath)
```

### 7.7 AbortSignal 处理

每层遍历前检查 `signal.aborted`，支持用户取消时立即终止。

---

## 8. 复杂度分析

### 8.1 假设参数

| 参数 | 符号 | 典型值 |
|------|------|--------|
| 总记忆文件数 | N | 50-500 |
| 层级深度 | L | 3-5 |
| 每层平均子层数 | C | 3-6 |
| 每层实际探索的子层数 | K | 1-2（剪枝后） |
| 叶子层平均文件数 | M | 5-20 |

### 8.2 时间复杂度

**当前扁平搜索**：
- 文件扫描：`O(N)` IO 操作
- sideQuery：1 次调用，prompt 长度 ∝ N
- **总复杂度**：`O(N + sideQuery_cost)`

**分层向下搜索**：
- 每层决策：读取 1 个 LAYER.md + 1 次 sideQuery
- 探索路径数：`K^L`（最坏），实际中 K≈1-2，L≈3-5
- sideQuery 调用次数：`L × paths`
- 叶子层文件选择：`O(M)` 每叶子
- **总复杂度**：`O(L × sideQuery_cost + total_leaf_files)`

**典型场景对比**（N=200, L=4, C=4, K=2）：

| 指标 | 扁平搜索 | 分层搜索 |
|------|----------|----------|
| 文件 IO | 200 次 frontmatter 读取 | ~4 次 LAYER.md + ~40 次叶子层 frontmatter |
| sideQuery 调用 | 1 次 | ~4 次（层级决策）+ ~2 次（叶子文件选择）= ~6 次 |
| 单次 sideQuery prompt tokens | ~200 个文件描述 ≈ 4K-8K tokens | ~4 个子层描述 ≈ 200-500 tokens |
| 总 input tokens | 4K-8K | 6 × 500 = 3K（更少！） |
| API 延迟 | 1 × RTT | 6 × RTT（但可并行化叶子层） |

### 8.3 Token 消耗详细估算

**扁平搜索（200 文件）**：
```
System prompt: ~200 tokens
200 × (filename + description + type): ~6,000 tokens
User query: ~50 tokens
Total input: ~6,250 tokens
Output (JSON with 5 filenames): ~100 tokens
Total: ~6,350 tokens
```

**分层搜索（4 层，每层 4 个子层）**：
```
层级决策 sideQuery（每层 1 次）：
  System: ~200 tokens
  4 × (子层名 + summary + keywords): ~400 tokens
  User query: ~50 tokens
  Input per call: ~650 tokens
  Output (4 × {name, score, reasoning}): ~200 tokens
  Per call: ~850 tokens
  4 层 × 850 = 3,400 tokens

叶子层文件选择（假设 2 个叶子层，每层 10 个文件）：
  2 × (system 200 + 10 files × 30 tokens + query 50 + output 100)
  = 2 × 650 = 1,300 tokens

Total: ~4,700 tokens（vs 扁平 6,350）
```

**结论**：即使 sideQuery 调用次数增加，总 token 消耗反而更低，因为每次决策的上下文大幅缩小。

### 8.4 延迟分析

**关键假设**：sideQuery 是主要延迟来源（API RTT ≈ 500ms-2s）

```
扁平搜索: 1 × RTT = ~1s
分层搜索: L × RTT = 4 × 1s = ~4s（串行）

优化方案：
1. 同层子层决策是 1 次 sideQuery（不是每个子层一次）
2. 不同分支的叶子层文件选择可并行
3. 实际: ~4 次串行（层级）+ 1 次并行（叶子）= ~5s 最坏情况
```

**延迟优化策略**：
- 启用 `cache_control` 缓存 LAYER.md 的解析结果
- Phase 0 快速路径避免完整遍历
- 浅层记忆（根层直接文件）优先返回，深层搜索异步补充

---

## 9. 实现路线图

### Phase 1: 基础设施（不触碰现有搜索）
1. 实现 `layerParser.ts`：解析 LAYER.md 的 frontmatter + json blocks
2. 实现 `LayerMetadata` 类型定义
3. 编写 LAYER.md 模板和生成工具

### Phase 2: 分层搜索模块（独立）
1. 实现 `findHierarchicalMemories.ts`
2. 编写各 phase 的 prompt 模板
3. 添加完整的边界情况处理

### Phase 3: 集成与开关
1. 在 `memdir.ts` 中添加 feature flag 入口
2. A/B 测试：对比扁平 vs 分层搜索的召回质量
3. 根据测试结果调整阈值参数

### Phase 4: 数据迁移
1. 提供脚本将现有扁平 memory 目录自动转换为分层结构
2. 根据 memory `type` 字段自动归类到对应顶层
3. 可选：基于语义聚类自动创建子层

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LAYER.md 维护负担 | 中 | 提供自动化工具生成/更新 LAYER.md |
| 分层结构不合理导致漏召回 | 高 | 宽入口策略（低阈值）+ 多分支保留 |
| sideQuery 调用次数增加导致延迟上升 | 中 | 快速路径 + 缓存 + 并行叶子层 |
| 向后兼容性 | 低 | 自动检测分层结构，无 LAYER.md 则回退扁平搜索 |
| LAYER.md 解析失败 | 低 | 降级为叶子层处理 + 日志告警 |
