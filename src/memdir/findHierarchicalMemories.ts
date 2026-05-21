/**
 * Hierarchical Memory Framework (HMF) — core recall algorithm.
 *
 * Four-phase downward-expansion search:
 *   Phase 0: Fast-path layer name detection in query
 *   Phase 1: Root layer evaluation (breadth-first, single-layer decision)
 *   Phase 2: Recursive downward expansion (depth-first, multi-branch retention)
 *   Phase 3: File selection within leaf layers
 *
 * Falls back to flat findRelevantMemories when no LAYER.md exists.
 */

import { readdir, stat } from 'fs/promises'
import { basename, join, relative } from 'path'
import { feature } from 'bun:bundle'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import { getDefaultSonnetModel } from '../utils/model/model.js'
import { jsonParse } from '../utils/slowOperations.js'
import { sideQuery } from '../utils/sideQuery.js'
import { parseFrontmatter } from '../utils/frontmatterParser.js'
import { readFileInRange } from '../utils/readFileInRange.js'
import {
  formatMemoryManifest,
  type MemoryHeader,
  scanMemoryFiles,
} from './memoryScan.js'
import type { RelevantMemory } from './findRelevantMemories.js'

// =============================================================================
// Query Complexity Classification
// =============================================================================

/**
 * Thrown when a query is classified as simple (does not need hierarchical search).
 * Callers should catch this and fall back to flat recall.
 */
export class HMF_SimpleQueryError extends Error {
  constructor(query: string) {
    super(`Query classified as simple, no hierarchical search needed: ${query}`)
    this.name = 'HMF_SimpleQueryError'
  }
}

/**
 * Heuristic query complexity classifier.
 *
 * Simple queries (e.g. "上次那个bug怎么修的？") don't need multi-layer
 * traversal — flat recall is faster (~1s vs ~4-5s).
 *
 * Complex signals take priority over simple signals to avoid missing
 * cross-layer information.
 */
export function classifyQueryComplexity(query: string): 'simple' | 'complex' {
  const lower = query.toLowerCase()

  // Complex signals — satisfy any one → complex
  const complexSignals: Array<RegExp | ((q: string) => boolean)> = [
    /(集成|整合|联动|交互)/,
    /(架构|设计|重构|迁移)/,
    /(多层|分层|上下游|端到端)/,
    /(对比|比较|区别|差异)/,
    /(为什么|原因|根因|分析)/,
    q => q.length > 80,
    /(v\d+|版本\d+)/,
    /(pass|module|layer|stage)/i,
  ]

  for (const signal of complexSignals) {
    const matched =
      typeof signal === 'function' ? signal(lower) : signal.test(lower)
    if (matched) return 'complex'
  }

  // Simple signals — satisfy any one → simple
  const simpleSignals: Array<RegExp | ((q: string) => boolean)> = [
    /^上次.*(怎么|如何|什么)/,
    /^(那个|这个).*(呢|吗)/,
    /^(查看|给我|找一下).*/,
    /^帮助.*回忆/,
    /^对/,
    /^还有/,
    q => q.length < 20,
  ]

  for (const signal of simpleSignals) {
    const matched =
      typeof signal === 'function' ? signal(lower) : signal.test(lower)
    if (matched) return 'simple'
  }

  // Default: medium-length queries are treated as complex to avoid missing
  // information (prefer false-positive complex over false-negative simple).
  return lower.length > 40 ? 'complex' : 'simple'
}

// =============================================================================
// Types
// =============================================================================

/** Metadata for a sub-layer reference parsed from LAYER.md */
interface SublayerRef {
  name: string
  path: string
  summary: string
  fileCount?: number
  keywords?: string[]
  aliases?: string[]
}

/** Parsed LAYER.md metadata */
interface LayerMetadata {
  name: string
  description?: string
  summary: string
  keywords: string[]
  sublayers: SublayerRef[]
}

/** A node in the layer hierarchy tree */
interface LayerNode {
  path: string // absolute directory path
  relativePath: string // path relative to memoryDir
  layerFile: string // absolute path to LAYER.md
  subLayers: string[] // absolute paths of child layer directories
  isLeaf: boolean
}

/** Result of hierarchical recall */
export interface HierarchicalRecallResult {
  selectedFiles: string[] // absolute file paths
  searchedLayers: string[] // for debugging/telemetry
  recallDepth: number
}

/** Internal search context */
interface SearchContext {
  query: string
  memoryDir: string
  signal: AbortSignal
  recentTools: readonly string[]
  alreadySurfaced: ReadonlySet<string>
  visitedLayers: Set<string>
  searchedLayers: string[]
  maxDepth: number
  minRelevance: number
  topKFiles: number
  maxSubLayers: number
  parallelBranches: boolean
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_DEPTH = 5
const DEFAULT_MIN_RELEVANCE = 40
const DEFAULT_TOP_K_FILES = 5
const DEFAULT_MAX_SUB_LAYERS = 5
const MULTI_BRANCH_GAP = 15

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

const SELECT_MEMORIES_SYSTEM_PROMPT = `You are selecting memories that will be useful to Claude Code as it processes a user's query. You will be given the user's query and a list of available memory files with their filenames and descriptions.

Return a list of filenames for the memories that will clearly be useful to Claude Code as it processes the user's query (up to 5). Only include memories that you are certain will be helpful based on their name and description.
- If you are unsure if a memory will be useful in processing the user's query, then do not include it in your list. Be selective and discerning.
- If there are no memories in the list that would clearly be useful, feel free to return an empty list.
- If a list of recently-used tools is provided, do not select memories that are usage reference or API documentation for those tools (Claude Code is already exercising them). DO still select memories containing warnings, gotchas, or known issues about those tools — active use is exactly when those matters.
`

// =============================================================================
// LAYER.md Cache
// =============================================================================

const layerCache = new Map<
  string,
  { mtimeMs: number; meta: LayerMetadata | null }
>()

async function parseLayerFileCached(
  layerPath: string,
): Promise<LayerMetadata | null> {
  try {
    const stats = await stat(layerPath)
    const cached = layerCache.get(layerPath)
    if (cached && cached.mtimeMs === stats.mtimeMs) {
      return cached.meta
    }

    const meta = await parseLayerFileInternal(layerPath)
    layerCache.set(layerPath, { mtimeMs: stats.mtimeMs, meta })
    return meta
  } catch {
    return null
  }
}

async function parseLayerFileInternal(
  layerPath: string,
): Promise<LayerMetadata | null> {
  let content: string
  try {
    const result = await readFileInRange(layerPath, 0, undefined, 32768)
    content = result.content
  } catch {
    return null
  }

  const { frontmatter, content: body } = parseFrontmatter(content, layerPath)

  const name =
    typeof frontmatter.name === 'string'
      ? frontmatter.name
      : basename(join(layerPath, '..'))
  const description =
    typeof frontmatter.description === 'string'
      ? frontmatter.description
      : undefined

  // Try to extract json:sublayers block
  const sublayers = extractJsonSublayers(body)

  // Extract summary from body (first paragraph after ## Summary)
  const summary = extractSection(body, 'Summary') || description || ''

  // Extract keywords from body (after ## Keywords)
  const keywordsText = extractSection(body, 'Keywords') || ''
  const keywords = keywordsText
    .split(/[,\n]/)
    .map(k => k.trim())
    .filter(k => k.length > 0)

  return {
    name,
    description,
    summary,
    keywords,
    sublayers,
  }
}

function extractJsonSublayers(body: string): SublayerRef[] {
  // Match ```json:sublayers or ```json blocks containing sublayers
  const match = body.match(/```(?:json:sublayers|json)\n([\s\S]*?)```/)
  if (!match) return []

  try {
    const parsed = jsonParse(match[1])
    if (Array.isArray(parsed)) {
      return parsed
        .map((item: unknown): SublayerRef | null => {
          if (typeof item !== 'object' || item === null) return null
          const obj = item as Record<string, unknown>
          if (typeof obj.name !== 'string' || typeof obj.path !== 'string')
            return null
          return {
            name: obj.name,
            path: obj.path,
            summary: typeof obj.summary === 'string' ? obj.summary : '',
            fileCount:
              typeof obj.fileCount === 'number' ? obj.fileCount : undefined,
            keywords: Array.isArray(obj.keywords)
              ? obj.keywords.filter((k): k is string => typeof k === 'string')
              : undefined,
            aliases: Array.isArray(obj.aliases)
              ? obj.aliases.filter((a): a is string => typeof a === 'string')
              : undefined,
          }
        })
        .filter((s): s is SublayerRef => s !== null)
    }
  } catch {
    // JSON parse failed — ignore and return empty
  }
  return []
}

function extractSection(body: string, sectionName: string): string | null {
  const regex = new RegExp(
    `##\\s*${sectionName}\\s*\\n\\n?([\\s\\S]*?)(?=\\n##\\s|$)`,
    'i',
  )
  const match = body.match(regex)
  if (match) {
    return match[1].trim()
  }
  return null
}

// =============================================================================
// Layer Discovery
// =============================================================================

export async function discoverLayers(
  memoryDir: string,
  currentPath: string = memoryDir,
  relativePath: string = '',
): Promise<LayerNode[]> {
  const nodes: LayerNode[] = []

  try {
    const entries = await readdir(currentPath, { withFileTypes: true })
    const subDirs = entries.filter(e => e.isDirectory()).map(e => e.name)

    const layerFile = join(currentPath, 'LAYER.md')
    const hasLayerFile = subDirs.includes('LAYER.md') || entries.some(
      e => e.isFile() && e.name === 'LAYER.md',
    )

    if (hasLayerFile || currentPath === memoryDir) {
      const childLayerPaths: string[] = []
      for (const subDir of subDirs) {
        const subPath = join(currentPath, subDir)
        const subLayerFile = join(subPath, 'LAYER.md')
        try {
          await stat(subLayerFile)
          childLayerPaths.push(subPath)
        } catch {
          // No LAYER.md in subdir — not a recognized layer
        }
      }

      const node: LayerNode = {
        path: currentPath,
        relativePath,
        layerFile,
        subLayers: childLayerPaths,
        isLeaf: childLayerPaths.length === 0,
      }
      nodes.push(node)

      // Recurse into sub-layers
      for (const childPath of childLayerPaths) {
        const childRel = relative(memoryDir, childPath)
        const childNodes = await discoverLayers(memoryDir, childPath, childRel)
        nodes.push(...childNodes)
      }
    }
  } catch {
    // Directory not readable — skip
  }

  return nodes
}

// =============================================================================
// Public API
// =============================================================================

export async function findHierarchicalMemories(
  query: string,
  memoryDir: string,
  signal: AbortSignal,
  recentTools: readonly string[] = [],
  alreadySurfaced: ReadonlySet<string> = new Set(),
  options?: {
    maxDepth?: number
    minRelevance?: number
    topKFiles?: number
    maxSubLayers?: number
    parallelBranches?: boolean
  },
): Promise<RelevantMemory[]> {
  // P0: Adaptive recall depth — skip hierarchical search for simple queries
  const complexity = classifyQueryComplexity(query)
  if (complexity === 'simple') {
    throw new HMF_SimpleQueryError(query)
  }

  const ctx: SearchContext = {
    query,
    memoryDir,
    signal,
    recentTools,
    alreadySurfaced,
    visitedLayers: new Set(),
    searchedLayers: [],
    maxDepth: options?.maxDepth ?? DEFAULT_MAX_DEPTH,
    minRelevance: options?.minRelevance ?? DEFAULT_MIN_RELEVANCE,
    topKFiles: options?.topKFiles ?? DEFAULT_TOP_K_FILES,
    maxSubLayers: options?.maxSubLayers ?? DEFAULT_MAX_SUB_LAYERS,
    parallelBranches: options?.parallelBranches ?? true,
  }

  // Phase 0: Fast path — detect explicit layer name in query
  const fastPathResult = await tryFastPath(ctx)
  if (fastPathResult) {
    ctx.searchedLayers.push(`FAST_PATH: ${fastPathResult}`)
    const files = await selectFilesInLeafLayer(fastPathResult, ctx)
    return deduplicateAndSlice(files, ctx.topKFiles)
  }

  // Phase 1 + 2: Hierarchical downward traversal
  const leafLayers = await traverseDown(ctx, memoryDir, 0)

  // Phase 3: File selection from all leaf layers
  if (leafLayers.length === 0) {
    return []
  }

  const allFiles = await selectFilesFromLayers(leafLayers, ctx)
  return deduplicateAndSlice(allFiles, ctx.topKFiles)
}

// =============================================================================
// Phase 0: Fast Path
// =============================================================================

async function tryFastPath(ctx: SearchContext): Promise<string | null> {
  const rootLayer = await parseLayerFileCached(join(ctx.memoryDir, 'LAYER.md'))
  if (!rootLayer) return null

  const lowerQuery = ctx.query.toLowerCase()

  for (const sub of rootLayer.sublayers) {
    const names = [sub.name, ...(sub.aliases || [])]
    if (names.some(n => lowerQuery.includes(n.toLowerCase()))) {
      return join(ctx.memoryDir, sub.path.replace(/^\.\//, '').replace(/^\.\\/, ''))
    }
  }

  return null
}

// =============================================================================
// Phase 1 + 2: Hierarchical Traversal
// =============================================================================

async function traverseDown(
  ctx: SearchContext,
  layerPath: string,
  depth: number,
): Promise<string[]> {
  if (ctx.signal.aborted) return []
  if (depth >= ctx.maxDepth) {
    ctx.searchedLayers.push(`DEPTH_LIMIT: ${layerPath}`)
    return [layerPath]
  }
  if (ctx.visitedLayers.has(layerPath)) return []

  ctx.visitedLayers.add(layerPath)
  ctx.searchedLayers.push(`VISIT: ${layerPath} (depth=${depth})`)

  const layerMeta = await parseLayerFileCached(join(layerPath, 'LAYER.md'))

  // Leaf layer: no sub-layers or no LAYER.md
  if (!layerMeta || layerMeta.sublayers.length === 0) {
    ctx.searchedLayers.push(`LEAF: ${layerPath}`)
    return [layerPath]
  }

  // Build LayerNode from metadata for evaluation
  const subLayerNodes: LayerNode[] = layerMeta.sublayers.map(sub => {
    const subPath = join(layerPath, sub.path.replace(/^\.\//, '').replace(/^\.\\/, ''))
    return {
      path: subPath,
      relativePath: relative(ctx.memoryDir, subPath),
      layerFile: join(subPath, 'LAYER.md'),
      subLayers: [],
      isLeaf: true, // will be determined by next level
    }
  })

  // Evaluate sub-layers via sideQuery
  const scores = await evaluateLayers(ctx.query, subLayerNodes, ctx.signal)
  if (scores.size === 0) {
    ctx.searchedLayers.push(`EVAL_FAIL: ${layerPath}`)
    return [layerPath]
  }

  // Select branches
  const branches = selectBranches(scores, ctx.maxSubLayers, ctx.minRelevance)

  if (branches.length === 0) {
    ctx.searchedLayers.push(`PRUNE: ${layerPath}`)
    return [layerPath]
  }

  ctx.searchedLayers.push(
    `BRANCH: ${layerPath} → [${branches.map(b => `${b}(${scores.get(b)})`).join(', ')}]`,
  )

  // Recurse into selected branches
  if (ctx.parallelBranches && branches.length > 1) {
    const results = await Promise.allSettled(
      branches.map(branch => traverseDown(ctx, branch, depth + 1)),
    )
    const leafPaths: string[] = []
    for (const result of results) {
      if (result.status === 'fulfilled') {
        leafPaths.push(...result.value)
      }
    }
    return leafPaths
  }

  const leafPaths: string[] = []
  for (const branch of branches) {
    const childResults = await traverseDown(ctx, branch, depth + 1)
    leafPaths.push(...childResults)
  }
  return leafPaths
}

function selectBranches(
  scores: Map<string, number>,
  maxSubLayers: number,
  minRelevance: number,
): string[] {
  const entries = Array.from(scores.entries())
    .filter(([, score]) => score >= minRelevance)
    .sort((a, b) => b[1] - a[1])

  if (entries.length === 0) return []

  const selected: string[] = [entries[0][0]]
  const topScore = entries[0][1]

  for (let i = 1; i < entries.length && selected.length < maxSubLayers; i++) {
    const [path, score] = entries[i]
    const gap = topScore - score
    // Keep if gap is small (ambiguous) or score is still high
    if (gap <= MULTI_BRANCH_GAP || score >= minRelevance + 10) {
      selected.push(path)
    }
  }

  return selected
}

// =============================================================================
// Layer Evaluation via sideQuery
// =============================================================================

async function evaluateLayers(
  query: string,
  layers: LayerNode[],
  signal: AbortSignal,
): Promise<Map<string, number>> {
  if (layers.length === 0) return new Map()

  const sublayersList = layers
    .map(l => {
      const name = basename(l.path)
      return `- **${name}**\n  Summary: ${l.relativePath}`
    })
    .join('\n\n')

  try {
    const result = await sideQuery({
      model: getDefaultSonnetModel(),
      system: LAYER_SELECTION_SYSTEM_PROMPT,
      skipSystemPromptPrefix: true,
      messages: [
        {
          role: 'user',
          content: `User query: "${query}"\n\nAvailable sub-layers:\n${sublayersList}\n\nEvaluate each sub-layer's relevance to the query. Return a JSON object with a "scores" field mapping each sub-layer name to a relevance score (0-100). Example: {"scores": {"frontend": 85, "backend": 20}}`,
        },
      ],
      max_tokens: 256,
      output_format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            scores: {
              type: 'object',
              additionalProperties: { type: 'number' },
            },
          },
          required: ['scores'],
          additionalProperties: false,
        },
      },
      signal,
      querySource: 'memdir_hierarchical_layer_eval',
    })

    const textBlock = result.content.find(block => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return new Map()
    }

    const parsed: { scores: Record<string, number> } = jsonParse(
      textBlock.text,
    )

    const scores = new Map<string, number>()
    for (const layer of layers) {
      const name = basename(layer.path)
      const score = parsed.scores?.[name]
      if (typeof score === 'number') {
        scores.set(layer.path, Math.max(0, Math.min(100, score)))
      }
    }
    return scores
  } catch (e) {
    if (signal.aborted) {
      return new Map()
    }
    logForDebugging(
      `[hierarchical] evaluateLayers failed: ${errorMessage(e)}`,
      { level: 'warn' },
    )
    return new Map()
  }
}

// =============================================================================
// Phase 3: File Selection from Leaf Layers
// =============================================================================

async function selectFilesInLeafLayer(
  leafPath: string,
  ctx: SearchContext,
): Promise<RelevantMemory[]> {
  try {
    const headers = await scanMemoryFiles(leafPath, ctx.signal)
    const filtered = headers.filter(
      h =>
        !ctx.alreadySurfaced.has(h.filePath) &&
        basename(h.filePath) !== 'LAYER.md' &&
        basename(h.filePath) !== 'MEMORY.md',
    )

    if (filtered.length === 0) return []
    if (filtered.length <= ctx.topKFiles) {
      return filtered.map(h => ({ path: h.filePath, mtimeMs: h.mtimeMs }))
    }

    const selected = await selectRelevantMemoriesFromHeaders(
      ctx.query,
      filtered,
      ctx.signal,
      ctx.recentTools,
    )

    return selected
      .map(filename => {
        const h = filtered.find(f => f.filename === filename)
        return h ? { path: h.filePath, mtimeMs: h.mtimeMs } : null
      })
      .filter((m): m is RelevantMemory => m !== null)
  } catch {
    return []
  }
}

async function selectFilesFromLayers(
  layerPaths: string[],
  ctx: SearchContext,
): Promise<RelevantMemory[]> {
  // Batch: collect all headers from all leaf layers first
  const allHeaders: MemoryHeader[] = []
  for (const leafPath of layerPaths) {
    try {
      const headers = await scanMemoryFiles(leafPath, ctx.signal)
      const filtered = headers.filter(
        h =>
          !ctx.alreadySurfaced.has(h.filePath) &&
          basename(h.filePath) !== 'LAYER.md' &&
          basename(h.filePath) !== 'MEMORY.md',
      )
      allHeaders.push(...filtered)
    } catch {
      // Skip unreadable leaf layer
    }
  }

  if (allHeaders.length === 0) return []
  if (allHeaders.length <= ctx.topKFiles) {
    return allHeaders.map(h => ({ path: h.filePath, mtimeMs: h.mtimeMs }))
  }

  const selected = await selectRelevantMemoriesFromHeaders(
    ctx.query,
    allHeaders,
    ctx.signal,
    ctx.recentTools,
  )

  return selected
    .map(filename => {
      const h = allHeaders.find(f => f.filename === filename)
      return h ? { path: h.filePath, mtimeMs: h.mtimeMs } : null
    })
    .filter((m): m is RelevantMemory => m !== null)
}

async function selectRelevantMemoriesFromHeaders(
  query: string,
  memories: MemoryHeader[],
  signal: AbortSignal,
  recentTools: readonly string[],
): Promise<string[]> {
  const validFilenames = new Set(memories.map(m => m.filename))
  const manifest = formatMemoryManifest(memories)

  const toolsSection =
    recentTools.length > 0
      ? `\n\nRecently used tools: ${recentTools.join(', ')}`
      : ''

  try {
    const result = await sideQuery({
      model: getDefaultSonnetModel(),
      system: SELECT_MEMORIES_SYSTEM_PROMPT,
      skipSystemPromptPrefix: true,
      messages: [
        {
          role: 'user',
          content: `Query: ${query}\n\nAvailable memories:\n${manifest}${toolsSection}`,
        },
      ],
      max_tokens: 256,
      output_format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            selected_memories: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['selected_memories'],
          additionalProperties: false,
        },
      },
      signal,
      querySource: 'memdir_hierarchical_file_select',
    })

    const textBlock = result.content.find(block => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return []
    }

    const parsed: { selected_memories: string[] } = jsonParse(textBlock.text)
    return parsed.selected_memories.filter(f => validFilenames.has(f))
  } catch (e) {
    if (signal.aborted) {
      return []
    }
    logForDebugging(
      `[hierarchical] selectRelevantMemories failed: ${errorMessage(e)}`,
      { level: 'warn' },
    )
    return []
  }
}

// =============================================================================
// Utilities
// =============================================================================

function deduplicateAndSlice(
  memories: RelevantMemory[],
  topK: number,
): RelevantMemory[] {
  const seen = new Set<string>()
  const unique: RelevantMemory[] = []
  for (const mem of memories) {
    if (!seen.has(mem.path)) {
      seen.add(mem.path)
      unique.push(mem)
    }
  }
  return unique.slice(0, topK)
}

/**
 * Check whether a memory directory has a hierarchical structure
 * (i.e., at least one LAYER.md exists).
 */
export async function hasHierarchicalStructure(
  memoryDir: string,
): Promise<boolean> {
  try {
    await stat(join(memoryDir, 'LAYER.md'))
    return true
  } catch {
    return false
  }
}

