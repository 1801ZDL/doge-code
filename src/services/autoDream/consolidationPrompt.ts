// Extracted from dream.ts so auto-dream ships independently of KAIROS
// feature flags (dream.ts is behind a feature()-gated require).

import {
  DIR_EXISTS_GUIDANCE,
  ENTRYPOINT_NAME,
  MAX_ENTRYPOINT_LINES,
} from '../../memdir/memdir.js'

export function buildConsolidationPrompt(
  memoryRoot: string,
  transcriptDir: string,
  extra: string,
): string {
  return `# Dream: Memory Consolidation

You are performing a dream — a reflective pass over your memory files. Synthesize what you've learned recently into durable, well-organized memories so that future sessions can orient quickly.

Memory directory: \`${memoryRoot}\`
${DIR_EXISTS_GUIDANCE}

Session transcripts: \`${transcriptDir}\` (large JSONL files — grep narrowly, don't read whole files)

---

## Phase 1 — Orient

- \`ls\` the memory directory to see what already exists
- Read \`${ENTRYPOINT_NAME}\` to understand the current index
- Skim existing topic files so you improve them rather than creating duplicates
- If \`logs/\` or \`sessions/\` subdirectories exist (assistant-mode layout), review recent entries there

## Phase 2 — Gather recent signal

Look for new information worth persisting. Sources in rough priority order:

1. **Daily logs** (\`logs/YYYY/MM/YYYY-MM-DD.md\`) if present — these are the append-only stream
2. **Existing memories that drifted** — facts that contradict something you see in the codebase now
3. **Transcript search** — if you need specific context (e.g., "what was the error message from yesterday's build failure?"), grep the JSONL transcripts for narrow terms:
   \`grep -rn "<narrow term>" ${transcriptDir}/ --include="*.jsonl" | tail -50\`

Don't exhaustively read transcripts. Look only for things you already suspect matter.

## Phase 3 — Consolidate

For each thing worth remembering, write or update a memory file. Memories may live at the top level or within subdirectories (layers) of the memory directory. Use the memory file format and type conventions from your system prompt's auto-memory section — it's the source of truth for what to save, how to structure it, and what NOT to save.

**Hierarchical organization:**
- If the memory directory uses a layered structure (subdirectories with \`LAYER.md\` files), place each memory in the most appropriate layer
- If a memory clearly belongs to an existing subdirectory, write it there rather than at the top level
- If an existing memory would be better organized in a different layer, move it (use the Write tool to create it at the new location, then remove the old file)
- When writing to a subdirectory, include a \`layer\` frontmatter field with the layer path (e.g., \`layer: "project/active-features"\`)

**Layer restructuring (do when needed):**
- Create new subdirectories when a new clearly separable theme emerges
- Merge or rename subdirectories when their boundaries have become blurry or names are no longer accurate
- Trigger conditions for restructuring: a layer contains more than 20 files, a new distinct topic has accumulated enough signal to warrant its own layer, or a layer's name no longer reflects its contents
- When restructuring, update the \`layer\` frontmatter field in moved files, update \`parents\` references in LAYER.md files, and update \`related\` associations as needed

Focus on:
- Merging new signal into existing topic files rather than creating near-duplicates
- Converting relative dates ("yesterday", "last week") to absolute dates so they remain interpretable after time passes
- Deleting contradicted facts — if today's investigation disproves an old memory, fix it at the source

## Phase 4 — Prune and index

Update \`${ENTRYPOINT_NAME}\` so it stays under ${MAX_ENTRYPOINT_LINES} lines AND under ~25KB. It's an **index**, not a dump — each entry should be one line under ~150 characters: \`- [Title](file.md) — one-line hook\`. Never write memory content directly into it.

- Remove pointers to memories that are now stale, wrong, or superseded
- Demote verbose entries: if an index line is over ~200 chars, it's carrying content that belongs in the topic file — shorten the line, move the detail
- Add pointers to newly important memories
- Resolve contradictions — if two files disagree, fix the wrong one

**LAYER.md maintenance (for hierarchical structures):**
If the memory directory has subdirectories with \`LAYER.md\` files, update each affected \`LAYER.md\`:
- \`## Summary\`: 2-3 sentences describing what memories live in this layer and their common theme
- \`## Keywords\`: 10-20 keywords/tags covering the semantic range of this layer (include synonyms)
- \`## Sub-layers\`: list of subdirectories with one-line summaries and file counts
- \`## Statistics\`: total files, type breakdown, last updated date, active topics
- Keep \`LAYER.md\` concise and accurate — it guides the hierarchical recall algorithm

Root \`${ENTRYPOINT_NAME}\` remains the high-level index listing top-level layers. Each layer's \`LAYER.md\` serves as a local index for that branch.

---

Return a brief summary of what you consolidated, updated, or pruned. If nothing changed (memories are already tight), say so.${extra ? `\n\n## Additional context\n\n${extra}` : ''}`
}
