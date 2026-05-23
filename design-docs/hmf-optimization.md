# HMF 延迟与 Token 消耗优化方案

> 版本：v1.0
> 日期：2026-05-21
> 状态：设计阶段
> 基线数据来源：`hierarchical-memory-recall.md` 复杂度分析章节 + `src/memdir/` 实际代码

---

## 0. 基线与目标

### 0.1 当前基线数据

| 指标 | 扁平搜索 | 分层搜索（串行，当前设计） |
|------|----------|---------------------------|
| 文件 IO | 200 次 frontmatter 读取 | ~44 次（~4 次 LAYER.md + ~40 次叶子层 frontmatter） |
| sideQuery 调用 | 1 次 | ~6 次（~4 次层级决策 + ~2 次叶子文件选择） |
| 单次 sideQuery prompt tokens | ~6,000（全部 200 个文件） | ~500（单层 3-6 个子层） |
| 总 input tokens | ~6,350 | ~4,700 |
| API 延迟 | ~1s（1 x RTT） | ~4-5s（串行 4-6 x RTT） |
| 召回文件数 | 最多 5 个 | 最多 5 个 |

**关键假设**：
- sideQuery RTT（Anthropic API Sonnet，max_tokens=256）≈ 800-1200ms，中位数取 1s
- 层级深度 L = 4，每层子层数 C = 4，剪枝后保留 K = 1-2 个分支
- 叶子层平均文件数 M = 10，命中 2 个叶子层

### 0.2 优化总目标

在用户指定的两个核心方向指导下，制定以下量化目标：

| 指标 | 当前分层搜索 | 优化后目标 |
|------|-------------|-----------|
| 端到端延迟 | ~4-5s | **<= 2s**（不超过扁平搜索的 2 倍） |
| 总 input tokens | ~4,700 | **<= 5,500**（控制在扁平搜索的 90% 以内） |
| sideQuery 调用次数 | ~6 次 | **<= 3 次** |
| 文件 IO 次数 | ~44 次 | **<= 20 次** |
| 召回质量 | 基准 | 不低于扁平搜索（A/B 验证） |

---

## 优化 1：并行子层评估（Parallel Layer Evaluation）

### 1.1 设计描述

当前串行设计的核心瓶颈在于：递归函数 `traverseDown` 对每个选中的子层依次递归调用，形成深度优先的串行链。如果某层选中 2 个子层，这 2 个子层的**下层评估**完全可以并行执行，因为它们互不依赖。

**关键洞察**：同一层的多个分支之间没有数据依赖——子层 A 的 LAYER.md 读取和 sideQuery 调用与子层 B 完全独立。只有"从父层到子层"这一步是顺序的（需要先知道选中哪些子层），但"从子层到孙层"可以并行。

**具体方案**：

1. 修改 `traverseDown` 的递归逻辑：在选中多个分支后，使用 `Promise.all()` 并行发起所有子层的下层遍历。
2. 每个并行分支独立执行：读取该子层的 LAYER.md → sideQuery 评估 → 继续向下。
3. 引入并发控制：使用 `p-limit` 或自定义 `Semaphore` 限制同时进行的 sideQuery 数量，避免触发 API 限流。

**关于 sideQuery 并行的可行性**：

Anthropic API 的并发处理是**请求级别的并行**——多个独立 HTTP 请求在服务端会被分配到不同的推理实例上并行处理（受限于账户级别的 rate limit）。对于企业级 API key，默认并发限制通常是较高的（数十到数百 req/s）。在 dl-code 的场景中，同一层的并行 sideQuery 通常不超过 2-3 个，远低于触发限流的阈值。

**限制选中数量**：将 `TOP_K_BRANCHES` 从 2 提升到 3-5，但同时引入更严格的分数门槛，确保只有真正高相关性的分支才会被并行评估。避免"为并行而并行"导致无意义的分支扩散。

### 1.2 改动点

- `src/memdir/findHierarchicalMemories.ts`：`traverseDown` 函数的核心递归逻辑
- 新增 `src/memdir/concurrency.ts`：轻量级并发控制（Semaphore / p-limit 简化版）
- `src/memdir/findHierarchicalMemories.ts`：参数调整（`TOP_K_BRANCHES` 改为动态计算）

```typescript
// 并行递归的核心改动
const childResults = await Promise.all(
  branches.map(branch =>
    withSemaphore(async () =>
      traverseDown(ctx, branch.layerPath, depth + 1)
    )
  )
)
```

### 1.3 量化分析

**延迟变化**：

以典型场景（深度 4，每层选中 2 个分支，最终命中 2 个叶子层）为例：

```
串行执行（当前）：
  根层 sideQuery → 子层A sideQuery → 孙层A1 sideQuery → 叶子层A 文件扫描+sideQuery
                                              ↓
                                        子层B sideQuery → 孙层B1 sideQuery → 叶子层B 文件扫描+sideQuery
  延迟 = 4 × 层级RTT + 2 × 叶子RTT = ~5s

并行执行（优化后）：
  根层 sideQuery
       ↓
  ┌────┴────┐
  ↓         ↓
子层A    子层B  （并行 sideQuery）
  ↓         ↓
孙层A1   孙层B1 （并行 sideQuery）
  ↓         ↓
叶子A    叶子B  （并行文件扫描，可并行 sideQuery）

延迟 = 2 × 层级RTT + 1 × 叶子RTT = ~3s（减少 40%）
```

更准确的计算：设层级深度为 L，平均分支因子为 K（剪枝后），并行度无上限：
- 串行延迟 = L × RTT_layer + K^(L-1) × RTT_leaf ≈ 4×1s + 2×1s = 6s（最坏）
- 并行延迟 = L × RTT_layer + RTT_leaf ≈ 4×1s + 1s = 5s（如果每层都并行）

实际上，由于 **同一层的多个分支 sideQuery 可以并行**，延迟从 O(L × RTT) 降到 O(L × RTT) 但常数因子减小：
- 串行：每层决策 + 每个分支递归 = 深度优先，路径长度累加
- 并行：每层决策后，所有分支同时展开 = 广度优先，只取最长路径

**实际估算**：
- 串行：~4-5s
- 并行后：~2.5-3.5s（减少 30-40%）

**sideQuery 次数**：不变（~6 次），但调用模式从"串行发起"变为"部分并行发起"

**Token 消耗**：不变（~4,700 input tokens）

### 1.4 风险/限制

| 风险 | 说明 | 缓解 |
|------|------|------|
| API 限流 | 并行发起多个 sideQuery 可能触发 rate limit | 引入 Semaphore 限制并发数（建议 max=3）；超出时退化为串行 |
| 分支爆炸 | 并行鼓励保留更多分支，导致 sideQuery 总数上升 | 严格保持 `TOP_K_BRANCHES` 上限（最多 3）；引入"累计叶子层上限"（如最多探索 4 个叶子） |
| 错误传播 | `Promise.all` 中一个分支失败导致全部失败 | 使用 `Promise.allSettled` + 过滤失败结果；单个分支失败不影响其他分支 |
| 调试复杂度 | 并行执行路径难以追踪和复现 | 增强 `searchPath` 日志，记录每个分支的启动/完成时间戳 |

### 1.5 优先级：P1（高价值）

延迟降低 30-40%，实现成本中等（改动集中在递归逻辑），风险可控。是"低 hanging fruit"中收益最高的优化。

---

## 优化 2：延迟记忆加载（Lazy Memory Loading）

### 2.1 设计描述

当前设计的 Phase 3 中，一旦选中最相关的文件，就立即读取完整内容（最多 4KB/文件）并插入上下文。这存在两个问题：
1. **过度读取**：sideQuery 选中的 5 个文件中，可能只有 2-3 个真正对当前 query 有用
2. **Token 浪费**：每个文件 4KB × 5 = 20KB 上下文注入，但其中部分可能是噪音

**两阶段延迟加载方案**：

**Stage 1（候选清单）**：只读取选中文件的 frontmatter（已有），构建包含文件名、description、type 的精简清单。不读取文件正文。

**Stage 2（主模型决策）**：将候选清单（最多 10 个文件的摘要）作为 `<system-reminder>` 注入，让主模型自行判断"需要阅读哪些文件"。主模型可以在后续 tool use 中通过 FileReadTool 主动读取。

**替代方案（推荐）**：候选清单直接作为 system-reminder 注入，格式类似：

```
[Relevant memory candidates]
The following memory files may be relevant. Read them with FileReadTool if needed:
- project/auth-rewrite.md: OAuth2 migration plan for auth module
- feedback/testing-policy.md: Integration tests must use real database
...
```

这样主模型在生成回复时，如果发现需要某个记忆的具体内容，会主动调用 FileReadTool 读取。这比"直接注入完整内容"更节省 token，也更灵活。

**关于 stopHooks 的适用性**：

不适合放在 stopHooks 中。stopHooks 在每次 tool use 后执行，而记忆召回是在用户输入后、主模型开始生成前触发的 prefetch。延迟加载的记忆需要在用户输入处理阶段就作为候选清单呈现，否则主模型无法在当前轮次主动读取。

### 2.2 改动点

- `src/utils/attachments.ts`：`readMemoriesForSurfacing` 函数增加 lazy 模式
- `src/memdir/findRelevantMemories.ts`：扩展返回类型，支持返回"候选清单"而非完整内容
- `src/memdir/findHierarchicalMemories.ts`：Phase 3 调整为返回候选摘要而非读取文件

```typescript
// 新增类型
interface LazyMemoryCandidate {
  path: string
  filename: string
  description: string | null
  type: MemoryType | undefined
  mtimeMs: number
}

// 延迟加载的附件格式
interface LazyRelevantMemoriesAttachment {
  type: 'relevant_memories_lazy'
  candidates: LazyMemoryCandidate[]
}
```

### 2.3 量化分析

**Token 节省**：

```
当前（ eagerly 加载）：
  5 个文件 × 4KB 平均 = 20KB = ~5,000 tokens 注入上下文

延迟加载（候选清单）：
  10 个候选 × (filename + description) ≈ 10 × 100 bytes = 1KB = ~250 tokens

节省：~4,750 tokens / turn（95% 减少）
```

**延迟变化**：
- 当前：文件读取 IO 在 sideQuery 完成后同步执行，增加 ~50-100ms（5 个文件并行读取）
- 延迟加载：省去文件正文读取，只保留 frontmatter（已在 sideQuery 前读取），**延迟减少 ~50-100ms**

**交互轮次影响**：
- 主模型可能需要额外一轮 FileReadTool 调用才能获取记忆内容
- 但这正是期望的行为：只有真正需要的记忆才被读取
- 对于简单 query（不需要深入记忆内容），零额外轮次

**总 token 消耗（端到端）**：
- 如果主模型读取 2 个文件：250（清单）+ 2 × 4KB = ~8,250 tokens
- 如果主模型不读取：仅 250 tokens
- **期望场景**：主模型只读取 1-2 个最相关的，总消耗低于 eager 加载

### 2.4 风险/限制

| 风险 | 说明 | 缓解 |
|------|------|------|
| 额外 tool use 轮次 | 主模型需要显式读取文件，增加交互轮次 | 候选清单中附带前 3-5 行摘要，帮助模型判断是否需要读取；复杂 query 保留 eager 加载 |
| 模型不读取 | 主模型可能忽略候选清单，导致记忆未被利用 | 在 system prompt 中明确引导："候选记忆可能包含重要上下文，如需详细信息请使用 FileReadTool 读取" |
| 与现有附件机制冲突 | 当前 `<system-reminder>` 附件直接注入内容 | 新增附件类型 `relevant_memories_lazy`，UI 层区分渲染 |
| 召回质量下降 | 不直接注入内容可能导致模型遗漏关键信息 | A/B 测试验证；对高相关性文件（score > 80）仍 eager 加载 |

### 2.5 优先级：P1（高价值）

Token 节省极其显著（95%），且对延迟有正向影响。主要风险在于交互模式的改变需要验证。建议作为可选模式（feature flag）先上线，A/B 测试验证后再默认开启。

---

## 优化 3：LAYER.md 缓存（Layer Metadata Cache）

### 3.1 设计描述

当前设计中，每次召回都从磁盘重新读取各层的 LAYER.md。在同一 session 内，层级结构是静态的（用户不会在对话中途修改 LAYER.md），因此可以安全地缓存解析结果。

**缓存策略**：

1. **会话级内存缓存**：在 `findHierarchicalMemories` 调用之间维护一个全局/模块级 `Map<layerPath, CachedLayer>`
2. **mtime 校验**：缓存时记录文件的 `mtimeMs`，下次使用时先比较 mtime，变化则重新读取
3. **首次预热**：第一次调用分层搜索时，可以一次性读取所有 LAYER.md 并缓存（或者按需缓存）

```typescript
// 模块级缓存
const layerCache = new Map<string, { mtimeMs: number; meta: LayerMetadata }>()

async function parseLayerFileCached(path: string): Promise<LayerMetadata | null> {
  const stats = await fsStat(path).catch(() => null)
  if (!stats) return null

  const cached = layerCache.get(path)
  if (cached && cached.mtimeMs === stats.mtimeMs) {
    return cached.meta
  }

  const meta = await parseLayerFileInternal(path)
  if (meta) {
    layerCache.set(path, { mtimeMs: stats.mtimeMs, meta })
  }
  return meta
}
```

**为什么不用文件系统缓存（如 fs.readFile 的 VFS 缓存）**：
Node.js 的 `fs.readFile` 确实会利用操作系统的 page cache，但：
1. 每次调用仍有 syscall 开销（open → stat → read → close）
2. LAYER.md 的解析（frontmatter + JSON block 提取）是 CPU 操作，可以缓存结果避免重复解析
3. 在 Windows/WSL 环境下，文件 IO 的 syscall 开销显著高于 Linux

### 3.2 改动点

- 新增 `src/memdir/layerCache.ts`：缓存管理模块
- `src/memdir/layerParser.ts`（或新增文件）：`parseLayerFileCached()` 包装函数
- `src/memdir/findHierarchicalMemories.ts`：替换 `parseLayerFile` 调用为 `parseLayerFileCached`

### 3.3 量化分析

**文件 IO 减少**：

```
典型场景（深度 4，命中 2 个分支）：
  串行搜索访问的 LAYER.md 数量：
    根层 → 子层A → 孙层A1 → 子层B → 孙层B1
    = 5 个 LAYER.md（部分可能重复访问，如果有分支汇合）

第一次调用（冷缓存）：5 次 LAYER.md 读取（与当前相同）
第二次及以后调用（热缓存）：0 次 LAYER.md 读取

叶子层 frontmatter 读取（Phase 3）：不在此优化范围内，但可通过类似机制缓存
```

**延迟影响**：
- LAYER.md 文件通常很小（< 2KB），单次读取 + 解析约 5-10ms
- 5 个 LAYER.md = ~25-50ms
- 热缓存时延迟减少 ~25-50ms（较小但稳定）

**更大收益场景**：
- 如果引入"并行子层评估"（优化 1），多个分支同时需要读取各自子层的 LAYER.md
- 在并行读取时，缓存可以避免多个并发请求同时读取同一文件（虽然 OS cache 也会处理，但解析缓存是额外的收益）

### 2.4 风险/限制

| 风险 | 说明 | 缓解 |
|------|------|------|
| 内存泄漏 | 长期运行的 session 中缓存无界增长 | 缓存键是文件绝对路径，数量受限于层级结构（通常 < 50）；如需清理，可在 session compact 时清空 |
| mtime 精度问题 | 某些文件系统的 mtime 精度为秒级 | 使用 `bigint` 精确比较；或额外比较文件大小 |
| 跨 session 失效 | 新 session 需要重新构建缓存 | 这是预期行为；可考虑持久化缓存到磁盘，但收益不大 |

### 3.5 优先级：P2（锦上添花）

单次收益较小（~25-50ms），但实现极其简单、零风险。作为其他优化的基础设施（缓存层可被延迟加载、并行评估等复用），值得顺手实现。

---

## 优化 4：召回预热（Recall Pre-warming）

### 4.1 设计描述

当前设计在用户输入完成后才开始搜索。考虑到 dl-code 的交互模式（用户在终端输入，有一定的打字间隔），可以利用对话间隙提前做轻量级的预筛选。

**方案 A：对话间隙预筛选（不推荐）**

在用户打字间隙（如 500ms 无输入）时，基于当前已输入的文本片段做轻量级层级预筛选。问题是：
1. 文本片段不完整，预筛选结果可能完全错误
2. 频繁触发预筛选会浪费 API 调用
3. 实现复杂（需要监听输入流）

**方案 B：基于主题连续性的缓存复用（推荐）**

核心洞察：**同一 session 中连续的用户 query 通常围绕同一主题**。上一次召回经过的层级路径和选中的文件，对下一次 query 有很高的参考价值。

**具体实现**：

1. **路径缓存**：缓存上一次的 `searchPath`（经过的层级路径）和最终选中的文件
2. **预热优先级**：下次召回时，优先检查缓存路径中的层级是否仍然相关
3. **快速验证 sideQuery**：用一次轻量级 sideQuery 验证缓存路径的相关性，如果高相关则跳过上层遍历，直接从缓存的叶子层开始文件选择

```typescript
interface RecallCache {
  query: string              // 上次的 query
  timestamp: number          // 缓存时间
  searchPath: string[]       // 经过的层级路径
  selectedFiles: string[]    // 最终选中的文件
  leafLayers: string[]       // 到达的叶子层
}

// 缓存复用逻辑
async function tryCachedRecall(ctx: SearchContext, cache: RecallCache): Promise<RelevantMemory[] | null> {
  // 1. 检查缓存新鲜度（如 5 分钟内）
  if (Date.now() - cache.timestamp > 5 * 60 * 1000) return null

  // 2. 检查 query 主题连续性（简单关键词重叠）
  const overlap = computeKeywordOverlap(ctx.query, cache.query)
  if (overlap < 0.3) return null  // 主题跳跃太大，不复用

  // 3. 快速验证缓存的叶子层是否仍然相关
  const validation = await validateLeafLayers(ctx, cache.leafLayers)
  ctx.sideQueryCalls++

  if (validation.isStillRelevant) {
    // 直接从缓存的叶子层开始文件选择，跳过层级遍历
    const files = await selectFilesInLeafLayers(cache.leafLayers, ctx)
    return files
  }

  return null  // 缓存失效，走完整搜索
}
```

**方案 C：stopHooks 期间的异步预热（辅助）**

在 stopHooks 执行期间（主模型正在生成回复，或工具正在执行），如果检测到用户下一轮 query 可能的方向（如从对话上下文推断），可以异步预热下一轮的层级结构。但这需要预测用户意图，实现复杂且容易出错，作为辅助方案。

### 4.2 改动点

- `src/memdir/findHierarchicalMemories.ts`：新增缓存复用逻辑（Phase 0 之前）
- `src/memdir/recallCache.ts`（新增）：缓存管理和主题连续性检测
- `src/memdir/findHierarchicalMemories.ts`：`HierarchicalRecallResult` 扩展缓存字段

### 4.3 量化分析

**命中率假设**：
- 同一 session 内连续 query 的主题连续性：~60-70%（基于编程会话的观察——用户通常围绕同一功能/bug 连续提问）
- 缓存命中时：跳过 3-4 次层级决策 sideQuery，只剩 1 次验证 + 1 次文件选择

**延迟变化**：

```
缓存命中（~60% 概率）：
  完整搜索：4 次层级 sideQuery + 2 次叶子 sideQuery = ~6s
  缓存复用：1 次验证 sideQuery + 1-2 次叶子 sideQuery = ~2-3s
  节省：~3-4s（50-70%）

缓存未命中（~40% 概率）：
  增加 1 次验证 sideQuery（~1s 开销）
  但验证失败后可以立即走完整搜索，无额外延迟
```

**期望延迟（加权平均）**：
```
0.6 × 2.5s + 0.4 × 5s = 3.5s（比基线 4-5s 减少 ~20-30%）
```

**Token 变化**：缓存命中时 token 消耗略减（跳过了多层决策的 prompt）；缓存未命中时增加一次验证的 prompt（~500 tokens）。

### 4.4 风险/限制

| 风险 | 说明 | 缓解 |
|------|------|------|
| 缓存污染 | 用户突然切换话题，复用缓存导致错误召回 | 严格的关键词重叠检查 + 低重叠时立即失效；验证 sideQuery 作为最终把关 |
| 验证成本 | 每次都要花 1 次 sideQuery 验证缓存 | 仅在缓存新鲜且主题连续时才尝试验证；验证失败率高的 query 模式自动降低缓存权重 |
| 多轮对话漂移 | 连续 3-4 轮后话题自然漂移 | 缓存设置 TTL（5 分钟）；或每轮降低关键词重叠阈值 |
| 状态管理 | 需要在 session 级别维护缓存状态 | 缓存在内存中，session compact 时自然清空 |

### 4.5 优先级：P1（高价值）

实现成本中等，但在高命中场景下延迟降低 50-70%。与并行评估（优化 1）结合效果更佳：缓存命中时延迟降到 ~2s，接近甚至低于扁平搜索。

---

## 优化 5：sideQuery 批处理（Batch sideQuery）

### 5.1 设计描述

当前设计的最大瓶颈是 sideQuery 调用次数。即使并行化，每次 sideQuery 仍有固定的网络 RTT。如果能将多个决策合并为单个 sideQuery，可以从根本上减少调用次数。

**方案：单层多子层批处理**

将"评估单层内的多个子层"合并为一次 sideQuery，让模型一次性返回所有子层的相关性分数。

当前设计（每层 1 次 sideQuery）：
```
sideQuery 输入：当前层的 LAYER.md + 用户 query
sideQuery 输出：各子层的 {name, score, reasoning}
```

这本身就是批处理——**当前设计已经是一次性评估所有子层**。重新阅读设计文档后确认：

`evaluateSublayers` 函数（Phase 1）确实是将当前层的所有子层信息一次性送入 sideQuery，模型返回所有子层的分数。所以"单层内"已经是批处理。

**真正的批处理机会：跨层批处理**

如果能预测或预先读取多层结构，可以将"第 1 层的子层评估 + 第 2 层的子层评估"合并为一次 sideQuery。但这就需要模型一次性看到整个层级树，决策复杂度会大幅上升。

**替代方案：叶子层文件选择批处理**

当前 Phase 3 中，如果命中多个叶子层，每个叶子层独立调用 `selectRelevantMemories`。这些可以合并：

```typescript
// 当前（串行或并行但多次调用）
for (const leafPath of leafLayers) {
  const files = await selectFilesInLeafLayer(leafPath, ctx)  // 每个叶子 1 次 sideQuery
}

// 优化后（单次批处理）
const allHeaders = await Promise.all(leafLayers.map(scanMemoryFiles))
const flattened = allHeaders.flat()
const selected = await selectRelevantMemories(ctx.query, flattened, ctx.signal, ctx.recentTools)
// 1 次 sideQuery 处理所有叶子层的所有文件
```

这要求将多个叶子层的文件合并后统一排序。由于不同叶子层已经是高相关性的分支，合并后文件总数仍然可控（假设 2 个叶子层 × 10 个文件 = 20 个文件，prompt 约 1,000 tokens）。

### 5.2 改动点

- `src/memdir/findHierarchicalMemories.ts`：Phase 3 逻辑修改
- `src/memdir/findRelevantMemories.ts`：`selectRelevantMemories` 已支持任意数量的文件，无需修改

### 5.3 量化分析

**sideQuery 次数变化**：

```
典型场景（深度 4，2 个叶子层）：
  当前：4 次层级决策 + 2 次叶子选择 = 6 次
  优化后：4 次层级决策 + 1 次合并叶子选择 = 5 次

极端场景（3 个叶子层）：
  当前：4 + 3 = 7 次
  优化后：4 + 1 = 5 次
```

**延迟变化**：
- 减少 1-2 次叶子层 sideQuery = 节省 1-2s
- 结合并行评估后：延迟从 ~3.5s 降到 ~2.5-3s

**Token 变化**：
- 合并后的叶子层文件选择 prompt 包含更多文件（20 个 vs 10 个）
- 但减少了一次 system prompt 的重复（system prompt ~200 tokens × 1 次节省）
- 净变化：基本持平或略增（+200-300 tokens）

### 5.4 风险/限制

| 风险 | 说明 | 缓解 |
|------|------|------|
| 跨层文件混淆 | 不同叶子层的文件有同名可能（虽然路径不同） | 在 manifest 中标注文件所属叶子层路径 |
| 文件数量过多 | 如果命中 4+ 个叶子层，合并后文件数可能超过 50 个 | 设置上限（最多合并 30 个文件），超出时保留 top 2 个叶子层分别处理 |
| 召回精度下降 | 跨层统一排序可能降低单层的区分度 | 在 prompt 中标注每个文件的层级来源，引导模型分层判断 |

### 5.5 优先级：P1（高价值）

实现简单（只需修改 Phase 3 的循环逻辑），收益明确（减少 1-2 次 sideQuery）。与优化 1 和 4 结合后，延迟可以逼近扁平搜索水平。

---

## 优化 6：自适应召回深度（Adaptive Recall Depth）

### 6.1 设计描述

并非所有 query 都需要分层深入。对于简单 query，扁平搜索可能更快且足够；对于复杂 query，分层搜索的质量优势才能体现。

**Query 复杂度分类器（轻量级，无需 sideQuery）**：

基于规则 + 启发式判断 query 复杂度：

```typescript
function classifyQuery(query: string): 'simple' | 'medium' | 'complex' {
  const lower = query.toLowerCase()

  // Simple 特征
  const simplePatterns = [
    /^(what|how|where|when|who|can you|please).{0,50}$/i,  // 短问题
    /^(show|list|get|find).{0,30}$/i,  // 简单指令
  ]
  if (simplePatterns.some(p => p.test(query))) return 'simple'

  // Complex 特征
  const complexIndicators = [
    /\b(architecture|design|rfc|decision|migration|refactor)\b/i,
    /\b(integrat|cross|multiple|compare|contrast)\b/i,
    query.length > 150,  // 长 query
    (query.match(/\b(and|or|but|however|moreover)\b/gi) ?? []).length >= 3,  // 多子句
  ]
  const complexScore = complexIndicators.filter(Boolean).length
  if (complexScore >= 2) return 'complex'

  return 'medium'
}
```

**自适应策略**：

| 复杂度 | 召回策略 | 说明 |
|--------|----------|------|
| `simple` | 扁平搜索（现有逻辑） | 低延迟，1 次 sideQuery |
| `medium` | 分层搜索 + 浅层限制（MAX_DEPTH=3） | 平衡延迟和质量 |
| `complex` | 完整分层搜索（MAX_DEPTH=5） | 最大召回质量 |

**动态阈值调整**：

对于 `medium` 复杂度，可以进一步调整参数：
- `RELEVANCE_THRESHOLD` 从 40 提高到 50（更严格剪枝）
- `TOP_K_BRANCHES` 从 2 降到 1（减少分支）
- 跳过 `cross-layer` 检查

### 6.2 改动点

- `src/memdir/findHierarchicalMemories.ts`：入口函数增加复杂度分类
- `src/memdir/queryClassifier.ts`（新增）：轻量级分类器
- `src/memdir/memdir.ts`：统一入口根据复杂度路由到不同策略

### 6.3 量化分析

**分类分布假设**（基于典型编程会话）：
- Simple：~40%（"上次怎么修的？", "show me the config"）
- Medium：~40%（"这个 bug 的原因是什么？", "怎么添加新命令？"）
- Complex：~20%（"SSBufOptV5 的 double buffer 问题", "前端后端集成方案"）

**期望延迟（加权平均）**：

```
0.4 × 1s（扁平）+ 0.4 × 2.5s（浅层分层）+ 0.2 × 4s（完整分层）
= 0.4 + 1.0 + 0.8 = 2.2s
```

对比当前分层搜索的固定 4-5s，**平均延迟降低 ~50%**。

**Token 消耗**：
- Simple：~6,350 tokens（扁平）
- Medium：~3,500 tokens（浅层）
- Complex：~4,700 tokens（完整分层）

加权平均：0.4 × 6350 + 0.4 × 3500 + 0.2 × 4700 = 2540 + 1400 + 940 = **4,880 tokens**

基本持平于当前分层搜索的 4,700 tokens。

### 6.4 风险/限制

| 风险 | 说明 | 缓解 |
|------|------|------|
| 分类错误 | Simple query 实际涉及深层记忆 | 分类为 simple 但仍保留分层结构检测——如果扁平搜索返回空，自动重试分层搜索 |
| 分类器演进 | 规则可能不覆盖所有场景 | 分类器保持简单可解释；收集误分类数据迭代改进 |
| 策略切换开销 | 用户感知到不一致（有时快有时慢） | 通过 telemetry 监控各策略的实际延迟，动态调整阈值 |

### 6.5 优先级：P0（必须做）

实现成本低（纯客户端规则，无 sideQuery），收益极高（平均延迟减半）。是最具性价比的优化，应作为第一优先级实施。

---

## 优化 7：跨层去重和合并（Cross-layer Deduplication）

### 7.1 设计描述

当并行搜索多个分支（优化 1）或命中多个叶子层时，不同分支可能召回同一个文件（例如通过 `related` 字段或跨层聚合文件）。需要在最终返回前进行去重。

**当前设计的去重**：

设计文档中已有 `deduplicateByPath` 和 `rankAndSlice` 的提及，但伪代码中未展示具体实现。需要在实现层面确保：

1. **路径去重**：相同绝对路径的文件只保留一次
2. **内容去重**：如果两个文件内容高度相似（通过 description 或 frontmatter 判断），保留较新的一个
3. **相关性分数合并**：如果同一文件被多个分支召回，合并其相关性分数（取最高或加权平均）

```typescript
function deduplicateAndRank(
  memories: RelevantMemory[],
  scores: Map<string, number>,  // 文件路径 → 相关性分数
): RelevantMemory[] {
  const seen = new Set<string>()
  const unique: RelevantMemory[] = []

  for (const mem of memories) {
    if (seen.has(mem.path)) {
      // 已存在，更新分数（取最高）
      const existing = unique.find(u => u.path === mem.path)!
      const existingScore = scores.get(mem.path) ?? 0
      const newScore = scores.get(mem.path) ?? 0  // 实际上需要每个分支独立评分
      scores.set(mem.path, Math.max(existingScore, newScore))
      continue
    }
    seen.add(mem.path)
    unique.push(mem)
  }

  // 按分数降序排序，取前 5
  return unique
    .sort((a, b) => (scores.get(b.path) ?? 0) - (scores.get(a.path) ?? 0))
    .slice(0, 5)
}
```

### 7.2 改动点

- `src/memdir/findHierarchicalMemories.ts`：`deduplicateByPath` 的实现增强
- 可选：`src/memdir/findRelevantMemories.ts`：扁平搜索的去重逻辑保持一致

### 7.3 量化分析

**去重影响**：
- 在典型场景下，跨层重复文件的概率较低（< 10%），因为层级结构本身就是语义分区的
- 但在跨层问题（如"前端后端集成"）中，重复概率上升到 ~20-30%
- 去重后召回文件数不变（仍最多 5 个），但 slot 利用率更高

**Token/延迟**：去重是纯客户端操作（Map 查找），开销可忽略（< 1ms）。

### 7.4 风险/限制

| 风险 | 说明 | 缓解 |
|------|------|------|
| 分数合并策略 | 取最高 vs 加权平均会影响最终排序 | 取最高分（简单且保守）；A/B 测试验证 |
| 信息丢失 | 去重后可能丢失"该文件在多个上下文都相关"的信息 | 在返回的附件中标注"该记忆从多个层级召回" |

### 7.5 优先级：P2（锦上添花）

实现简单，风险低，但直接收益也较小（主要提升召回质量而非延迟/token）。作为分层搜索的标准功能顺手实现即可。

---

## 8. 组合优化效果预测

### 8.1 优化组合策略

以下按优先级组合，计算累积效果：

**Phase 1：P0 优化（必须做）**
- 优化 6：自适应召回深度

**Phase 2：P1 优化（高价值）**
- 优化 1：并行子层评估
- 优化 4：召回预热（缓存复用）
- 优化 5：sideQuery 批处理

**Phase 3：P1-P2 优化（锦上添花）**
- 优化 2：延迟记忆加载
- 优化 3：LAYER.md 缓存
- 优化 7：跨层去重

### 8.2 P0 + P1 组合效果

假设场景分布：Simple 40% / Medium 40% / Complex 20%

**Simple query（自适应 → 扁平搜索）**：
| 指标 | 基线（分层串行） | 优化后 |
|------|----------------|--------|
| 延迟 | ~4-5s | ~1s（直接走扁平） |
| 文件 IO | ~44 次 | 200 次（但扁平搜索文件读取是并行的，实际 IO 时间相近） |
| sideQuery | ~6 次 | 1 次 |
| Input tokens | ~4,700 | ~6,350 |

**Medium query（自适应 → 浅层分层 + 并行 + 批处理）**：
| 指标 | 基线 | 优化后 |
|------|------|--------|
| 延迟 | ~4-5s | ~1.5-2s（深度 3 + 并行 + 批处理） |
| 文件 IO | ~44 次 | ~25 次（深度减少 + 叶子层合并） |
| sideQuery | ~6 次 | ~3 次（2 次层级 + 1 次合并叶子） |
| Input tokens | ~4,700 | ~3,200（浅层 + 批处理减少 system prompt 重复） |

**Complex query（完整分层 + 并行 + 批处理 + 缓存）**：
| 指标 | 基线 | 优化后（缓存未命中） | 优化后（缓存命中） |
|------|------|---------------------|-------------------|
| 延迟 | ~4-5s | ~3-3.5s | ~2-2.5s |
| 文件 IO | ~44 次 | ~35 次 | ~20 次 |
| sideQuery | ~6 次 | ~5 次 | ~2-3 次 |
| Input tokens | ~4,700 | ~4,500 | ~3,000 |

**加权平均（P0+P1）**：

| 指标 | 扁平搜索 | 分层搜索（基线） | **P0+P1 优化后** | 优化幅度 |
|------|----------|-----------------|------------------|----------|
| **平均延迟** | ~1s | ~4-5s | **~1.8-2.2s** | **↓ 55-60%** |
| **文件 IO** | 200 次 | ~44 次 | **~28 次** | **↓ 35%** |
| **sideQuery 次数** | 1 次 | ~6 次 | **~2.5 次** | **↓ 58%** |
| **总 input tokens** | ~6,350 | ~4,700 | **~4,200** | **↓ 10%** |
| **召回质量** | 基准 | 预期更好 | **不低于扁平** | 持平或提升 |

### 8.3 加入 P2 优化后的完整效果

加入延迟记忆加载（优化 2）后，token 消耗进一步降低：

| 指标 | P0+P1 | P0+P1+P2（完整） |
|------|-------|-----------------|
| 平均延迟 | ~1.8-2.2s | ~1.7-2.1s（LAYER.md 缓存贡献 -50ms） |
| 文件 IO | ~28 次 | ~25 次（热缓存） |
| sideQuery 次数 | ~2.5 次 | ~2.5 次 |
| **总 input tokens** | ~4,200 | **~2,800-4,000**（延迟加载节省 40-95% 记忆注入 tokens） |

注意：延迟加载的 token 节省是"每轮次"的，如果主模型主动读取文件，总消耗会回升。但**期望场景**（主模型只读取 1-2 个最相关文件）下，端到端 token 消耗显著低于 eager 加载。

---

## 9. 实施路线图

### Phase 1：P0 快速收益（1 周）

**目标**：实现自适应召回深度，让 40% 的 query 直接走扁平搜索。

**任务**：
1. 实现 `src/memdir/queryClassifier.ts`：轻量级 query 复杂度分类器
2. 修改 `src/memdir/memdir.ts` 统一入口：根据复杂度路由到扁平或分层搜索
3. 调整分层搜索参数支持浅层模式（`MAX_DEPTH` 动态设置）
4. A/B 测试：对比自适应 vs 纯分层搜索的延迟和质量

**验收标准**：
- [ ] Simple query 延迟 <= 1.5s
- [ ] Medium query 延迟 <= 3s
- [ ] Complex query 延迟 <= 5s（不劣于基线）
- [ ] 召回质量不低于纯分层搜索

### Phase 2：P1 核心优化（2 周）

**目标**：实现并行评估、召回缓存、sideQuery 批处理。

**任务**：
1. 实现 `src/memdir/concurrency.ts`：并发控制（Semaphore）
2. 修改 `traverseDown`：支持并行子层递归
3. 实现 `src/memdir/recallCache.ts`：召回缓存 + 主题连续性检测
4. 修改 Phase 3：多叶子层文件选择合并为单次 sideQuery
5. 集成测试：验证三种优化协同工作的正确性

**验收标准**：
- [ ] 并行评估后延迟降低 >= 30%
- [ ] 缓存命中率 >= 50%（主题连续 session）
- [ ] sideQuery 次数中位数 <= 3
- [ ] 无 API 限流错误

### Phase 3：P2 体验优化（1 周）

**目标**：实现延迟加载、LAYER.md 缓存、跨层去重。

**任务**：
1. 实现 `src/memdir/layerCache.ts`：LAYER.md 解析缓存
2. 修改 `readMemoriesForSurfacing`：支持 lazy 模式（候选清单）
3. 实现跨层去重逻辑
4. 添加 feature flag 控制各优化开关

**验收标准**：
- [ ] LAYER.md 缓存热命中时零文件 IO
- [ ] 延迟加载模式下记忆注入 token 减少 >= 80%
- [ ] 跨层重复文件正确去重

### Phase 4：度量与调优（持续）

**目标**：基于生产数据持续优化参数。

**任务**：
1. 在 `tengu_api_success` telemetry 中增加 `recallStrategy` 字段（flat/shallow/deep）
2. 监控各策略的实际延迟分布和 token 消耗
3. 根据数据调整分类器阈值、缓存 TTL、并行并发度
4. 每月回顾一次，迭代优化

---

## 10. 附录：各优化参数汇总

| 参数 | 当前值 | 优化后值 | 所属优化 |
|------|--------|----------|----------|
| `TOP_K_BRANCHES` | 2 | 2-3（动态） | 优化 1 |
| `MAX_PARALLEL_SIDEQUERIES` | N/A（串行） | 3 | 优化 1 |
| `RELEVANCE_THRESHOLD` | 40 | 40/50/40（simple/medium/complex） | 优化 6 |
| `MAX_DEPTH` | 5 | 1/3/5（simple/medium/complex） | 优化 6 |
| `RECALL_CACHE_TTL_MS` | N/A | 300,000（5 分钟） | 优化 4 |
| `KEYWORD_OVERLAP_THRESHOLD` | N/A | 0.3 | 优化 4 |
| `LEAF_BATCH_MAX_FILES` | N/A（逐个处理） | 30 | 优化 5 |
| `LAZY_LOADING` | false | true（feature flag） | 优化 2 |
| `LAYER_CACHE_ENABLED` | false | true | 优化 3 |
