import { isAutoMemoryEnabled, getAutoMemPath } from '../../memdir/paths.js'
import { getOriginalCwd } from '../../bootstrap/state.js'
import { registerBundledSkill } from '../bundledSkills.js'

const INIT_MEMORY_PROMPT = `# /init-memory — Initialize Hierarchical Memory Framework

You are initializing the Hierarchical Memory Framework (HMF) for this project. This creates a layered directory structure under the auto-memory directory that enables efficient hierarchical memory recall.

## Your Task

Create a layered memory directory structure based on the project's actual code organization.

## Step 1: Check Existing Memory State

Use the Glob tool to check whether the auto-memory directory already contains files.

- Memory root: \`{MEMORY_ROOT}\`
- If the directory is empty or does not exist, proceed directly to Step 2.
- If MEMORY.md or any .md files exist:
  1. List all existing files (using Glob or Read as needed)
  2. Use **AskUserQuestionTool** to present an interactive choice to the user. Call the tool with this exact structure:

     \`\`\`json
     {
       "questions": [
         {
           "question": "Memory files already exist in this project. What would you like to do?",
           "header": "Init Memory",
           "options": [
             {
               "label": "Overwrite",
               "description": "Replace everything with a fresh hierarchical structure. Existing files will be kept but the root MEMORY.md will be rebuilt."
             },
             {
               "label": "Append",
               "description": "Preserve existing files and create a hierarchical layer structure alongside them. Existing files will be analyzed and reorganized into appropriate layers."
             },
             {
               "label": "Cancel",
               "description": "Stop and do nothing. The current memory files remain unchanged."
             }
           ]
         }
       ]
     }
     \`\`\`

  3. Wait for the user's selection.
  4. Based on the answer:
     - "Overwrite" → proceed with OVERWRITE mode (skip to Step 2, proceed as normal)
     - "Append" → proceed with APPEND mode (continue to Step 1-A below)
     - "Cancel" → STOP and report: "Initialization cancelled. Existing memory files remain unchanged."
     - "Other" (custom text) → STOP and report: "Custom action not supported. Please choose Overwrite, Append, or Cancel."

## Mode Selection

The mode is determined by the user's response to the AskUserQuestionTool in Step 1:
- **OVERWRITE**: Triggered when the user selects "Overwrite". The agent proceeds with standard steps (Step 2 onwards), rebuilding the hierarchy from scratch. Existing files are kept but the root MEMORY.md is rebuilt.
- **APPEND**: Triggered when the user selects "Append". The agent preserves existing files, builds the hierarchy alongside them, and reorganizes as needed. Follow the extended steps in Step 1-A below, then continue with standard steps.
- **CANCEL**: Triggered when the user selects "Cancel" or "Other". The agent stops and reports the current state without making changes.

If OVERWRITE was chosen or the directory was empty, proceed directly to Step 2. If APPEND was chosen, follow Step 1-A first, then continue with Step 2.

### Append Mode Overview

In Append mode:
1. **Preserve** all existing .md files (do NOT delete them)
2. **Read** all existing .md files to understand their content and relationships
3. **Analyze** whether files should be:
   - **Consolidated**: Multiple similar files merged into one (e.g., multiple feedback files → one consolidated feedback.md)
   - **Split**: A file with unrelated topics divided into multiple files in different layers
   - **Reorganized**: Moved to the appropriate layer directory
   - **Left as-is**: Kept in root if no clear layer match
4. **Create** the hierarchical layer structure alongside existing files
5. **Update** all LAYER.md files to reflect actual file counts
6. **Update** MEMORY.md to include both the layer structure and existing file references

#### Consolidation Rules
- Only consolidate files if they share the same \`type\` AND have similar content/themes
- When merging, combine frontmatter (keep the most specific name/description)
- When merging, combine content with clear section dividers
- Update \`related\` fields to reference merged sources
- After merging, keep the original files as cross-reference aggregators (with \`related\` links pointing to the merged file), OR update them to become cross-reference aggregators
- **DO NOT** consolidate if the user might want to keep files separate
- **Be conservative**: merge only when files are clearly duplicative

#### Splitting Rules
- Only split a file if it clearly contains 2+ unrelated topics
- Each split part gets its own file with appropriate frontmatter, placed in the corresponding layer directory
- The original file MUST be kept as a cross-layer aggregator (with \`related\` links to the new split files)
- Update the original file's frontmatter to add \`related\` field referencing the new files
- **Be conservative**: only split when topics are clearly unrelated

#### Reorganization (Archival) Rules
- Read each existing file's frontmatter to determine its type
- Map types to target layers:
  - \`type: user\` → \`user/\` layer
  - \`type: feedback\` → \`feedback/\` layer
  - \`type: project\` → \`project/\` or sub-layer based on content analysis
  - \`type: reference\` → \`reference/\` layer
- For \`type: project\` files, read content to determine appropriate sub-layer (architecture, features, incidents, etc.)
- Move file to target layer directory:
  - Use Read to read the original file
  - Use Write to create the file in the new location with updated frontmatter (add \`layer\` field)
  - Use Edit to update the original file to become a cross-reference aggregator (add \`related\` link), OR keep the original as-is if it is already in a reasonable location
- Update the target layer's LAYER.md:
  - Increment fileCount in the \`json:sublayers\` block
  - Update the sub-layer list entry to show the correct file count
- Update parent LAYER.md files up the chain to reflect new file counts

## Step 2: Scan Project Structure

Scan the project root to understand the codebase.

- Project root: \`{PROJECT_ROOT}\`

Use Glob to discover the top-level directory structure, excluding noise:

- Exclude: node_modules/, .git/, dist/, build/, out/, coverage/, .next/, .nuxt/, .svelte-kit/, target/ (Rust), __pycache__/, .venv/, .pytest_cache/, .mypy_cache/
- Scan patterns to use:
  - \`{PROJECT_ROOT}/\` (top-level files)
  - \`{PROJECT_ROOT}/*/\` (top-level directories)
  - \`{PROJECT_ROOT}/*/*/\` (second-level directories, up to 50 results)

## Step 3: Read Key Configuration Files

Read the following files if they exist (use Read, one call per file that exists):
- {PROJECT_ROOT}/package.json
- {PROJECT_ROOT}/tsconfig.json
- {PROJECT_ROOT}/Cargo.toml
- {PROJECT_ROOT}/pyproject.toml
- {PROJECT_ROOT}/setup.py
- {PROJECT_ROOT}/go.mod
- {PROJECT_ROOT}/CMakeLists.txt
- {PROJECT_ROOT}/README.md
- {PROJECT_ROOT}/CLAUDE.md

Extract: project name, description, language/framework, key dependencies, module structure.

## Step 4: Infer Layer Hierarchy

Based on the directory structure and config files, construct a JSON hierarchy tree.

**Guidelines for the hierarchy:**
- Depth: 2–4 levels (including the root level).
- Each layer name: kebab-case, lowercase, semantic.
- Each layer description: one concise sentence describing what memories belong there.
- Suggested top-level layers for typical projects:
  - \`user\` — User profile, preferences, communication style
  - \`feedback\` — User feedback and guidance on how to work
  - \`project\` — Ongoing work, goals, incidents, architecture decisions (with sub-layers like \`architecture\`, \`features\`, \`incidents\`)
  - \`reference\` — External systems, dashboards, APIs, documentation
- If the project structure suggests a different organization (e.g. \`frontend\`, \`backend\`, \`infra\`), use that instead.
- For very simple projects (< 10 source files), a flat structure with 2-3 top-level layers is acceptable.

**Output format — a JSON object:**

\`\`\`json
{
  "layers": [
    {
      "name": "frontend",
      "description": "Frontend application code, UI components, and user-facing features",
      "subLayers": [
        {
          "name": "parser",
          "description": "Lexical analysis and syntax parsing modules",
          "subLayers": []
        },
        {
          "name": "ast",
          "description": "AST construction, validation, and traversal",
          "subLayers": []
        }
      ]
    },
    {
      "name": "backend",
      "description": "Backend services, APIs, and data layer",
      "subLayers": [
        { "name": "api", "description": "REST and GraphQL endpoint handlers" },
        { "name": "database", "description": "Schema, migrations, and query logic" }
      ]
    }
  ]
}
\`\`\`

Each \`subLayers\` array may be empty (leaf layer) or contain further layer objects with the same shape. Maximum depth: 4.

After generating the JSON, validate:
- No duplicate layer names at the same level.
- All names are kebab-case (lowercase, hyphens only).
- Total layers do not exceed 20.

## Step 5: Create Directories

For each layer in the hierarchy, create its directory path under \`{MEMORY_ROOT}\`.

Directory structure:
\`\`\`
{MEMORY_ROOT}/
├── MEMORY.md
└── <layer-name>/
    ├── LAYER.md
    └── <sub-layer-name>/
        ├── LAYER.md
        └── ...
\`\`\`

Use the Bash tool with \`mkdir -p\` to create all directories in one or a few calls.

## Step 6: Write LAYER.md Files

For each layer (including the root level), write a \`LAYER.md\` file with this exact template:

\`\`\`markdown
---
name: {layer-name}
description: {one-line description}
type: layer
created: {ISO_DATE}
updated: {ISO_DATE}
---

# {Human-readable Layer Name}

## Summary

{A 2-3 sentence description of what memories live in this layer and their common theme, based on the project context.}

## Keywords

{10-20 comma-separated keywords/tags covering the semantic range of this layer.}

## Sub-layers

{If this layer has sub-layers, list them as markdown links:}
- [{sub1_name}](./{sub1_name}) — {one-line summary} (0 files)
- [{sub2_name}](./{sub2_name}) — {one-line summary} (0 files)

\`\`\`json:sublayers
[
  {"name": "{sub1_name}", "path": "./{sub1_name}", "summary": "{one-line summary}", "fileCount": 0, "keywords": ["kw1", "kw2"]},
  {"name": "{sub2_name}", "path": "./{sub2_name}", "summary": "{one-line summary}", "fileCount": 0, "keywords": ["kw3", "kw4"]}
]
\`\`\`

## Statistics

- Total files: 0
- Last updated: {ISO_DATE}

## Parent

[← {parent_name}]({parent_link})
\`\`\`

**Template rules:**
- Replace all \`{placeholders}\` with actual values.
- The \`json:sublayers\` code block MUST be valid JSON inside a \`\`\`json:sublayers\`\`\` fenced block. This is machine-parsable.
- For leaf layers (no sub-layers), omit the entire "Sub-layers" section (both the markdown list and the json:sublayers block).
- For the root-level LAYER.md (placed at \`{MEMORY_ROOT}/LAYER.md\`), the parent link should be \`[← Root](../MEMORY.md)\`.
- For top-level layers under root, the parent link should be \`[← Root](../LAYER.md)\`.
- For deeper layers, the parent link should point up to the parent's LAYER.md (e.g., \`[← Frontend](../../LAYER.md)\` or \`[← Frontend](../LAYER.md)\` depending on depth).
- Date format: YYYY-MM-DD (e.g., 2026-05-21).

### File Operations for Append Mode

When reorganizing existing files in Append mode, use these specific tool operations:

**To move a file to a layer (Recommended: Option A):**
1. Use Read to read the original file content and frontmatter
2. Use Write to create the file in the new layer location with:
   - Updated frontmatter: add \`layer\` field with the target layer path
   - Same content as original
3. Use Edit to update the original file to become a cross-reference aggregator:
   - Replace content with a pointer to the new location
   - Add \`related\` field in frontmatter pointing to the new file
   - Example aggregator content: \`Moved to [{new_name}](./{layer_path}/{new_name}.md)\`
4. Update the target layer's LAYER.md to reflect the new file count

**To merge files:**
1. Read all files to be merged
2. Analyze frontmatter:
   - Use the most specific \`name\` and \`description\`
   - Combine \`related\` fields from all sources
   - Set \`type\` to the common type
   - Add \`layer\` field for the target layer
3. Combine content with clear section dividers:
   - Use \`---\` or \`## Section: {source_name}\` between merged parts
   - Preserve original content as much as possible
4. Write the merged file to the target layer using Write
5. For each original file, use Edit to convert it to a cross-reference aggregator:
   - Update frontmatter with \`related: ["./{target_layer}/{merged_file}.md"]\`
   - Replace body with: \`Consolidated into [{merged_name}](./{target_layer}/{merged_file}.md)\`
6. Update target layer's LAYER.md file count

**To split a file:**
1. Read the original file
2. Identify distinct topics/sections (each should be self-contained)
3. For each topic:
   - Create a new file in the appropriate layer using Write
   - Write appropriate frontmatter with \`type\`, \`name\`, \`description\`, \`layer\`
   - Write the topic-specific content
4. Use Edit to update the original file:
   - Keep original frontmatter
   - Add \`related\` field listing all new split files
   - Replace body with a cross-reference aggregator:
     \`\`\`markdown
     ## Split Topics
     - [{topic1}](./{layer1}/{file1}.md)
     - [{topic2}](./{layer2}/{file2}.md)
     \`\`\`
5. Update all affected layer LAYER.md file counts

**To leave a file as-is:**
- Simply note it in the report as "Left as-is"
- Do not modify the file
- If it is in the root directory, it will remain there

**Important constraints:**
- NEVER delete existing .md files (always convert to aggregators or leave as-is)
- ALWAYS preserve original frontmatter key fields (\`name\`, \`description\`, \`type\`)
- ALWAYS update \`json:sublayers\` in LAYER.md when files are added to a layer
- ALWAYS update parent LAYER.md files up the chain with new file counts

## Step 7: Write MEMORY.md Root Index

Write the root \`MEMORY.md\` at \`{MEMORY_ROOT}/MEMORY.md\`:

\`\`\`markdown
# Memory Index

This is the root index of the hierarchical memory system.

## Top-level Layers

{List each top-level layer as a markdown link:}
- [{layer1_name}](./{layer1_name}) — {description}
- [{layer2_name}](./{layer2_name}) — {description}

## Cross-layer Links

_Reserved for cross-layer aggregation issues. None yet._

## Statistics

\`\`\`json:root-stats
{
  "totalLayers": {count},
  "totalFiles": 0,
  "maxDepth": {max_depth},
  "lastConsolidated": "{ISO_DATE}T00:00:00Z"
}
\`\`\`

---

*Last updated: {ISO_DATE}*
\`\`\`

## Step 8: Report Results

After creating everything, report to the user.

### Standard Mode Report

1. How many top-level layers were created.
2. How many total layers (including sub-layers).
3. Maximum depth of the hierarchy.
4. The names of all top-level layers.
5. A confirmation message: "Hierarchical memory framework initialized. You can now start recording memories. Use /dream to consolidate memories periodically."

### Append Mode Report

If running in Append mode, use this format:

\`\`\`markdown
## Results

1. **Layers created**: X top-level, Y total (max depth Z)
2. **Existing files processed**: N total
   - Consolidated: A files → B files
   - Split: C files → D files
   - Reorganized: E files moved to layers
   - Left as-is: F files
3. **New structure**:
   - Top-level layers: [list]
4. **Files by layer**:
   - \`layer-name/\`: [file1.md, file2.md, ...]
5. **Cross-layer aggregators**: [list if any]
\`\`\`

**Append Mode Report Requirements:**
- **Layers created**: Report the number of top-level layers, total layers, and maximum depth of the hierarchy.
- **Existing files processed**: Report the total number of existing .md files that were analyzed.
  - **Consolidated**: Report how many original files were merged into how many consolidated files. List the original files and the resulting merged file.
  - **Split**: Report how many original files were split into how many new files. List the original files and the resulting split files.
  - **Reorganized**: Report how many files were moved to layer directories. List each file and its new location.
  - **Left as-is**: Report how many files were kept in their original location. List these files.
- **Files by layer**: For each layer (including root), list all .md files now present in that layer.
- **Cross-layer aggregators**: List any files that were converted to cross-reference aggregators (with \`related\` links). Include their paths and what they point to.
- **Confirmation message**: "Hierarchical memory framework updated in Append mode. Existing files preserved and reorganized. Use /dream to consolidate memories periodically."

## Tool Constraints

You have access to: Read, Glob, Grep, Bash, Edit, Write, AskUserQuestion.
- Use Glob for scanning, Read for config files and existing memories
- Use AskUserQuestionTool for interactive user choices
- Use Write for creating LAYER.md and MEMORY.md
- Use Bash for mkdir
- Use Edit for reorganizing existing files in Append mode
- Do NOT modify any files outside the memory directory
- Do NOT read source code files (only config files and README/CLAUDE.md)
`

export function registerInitMemorySkill(): void {
  if (!isAutoMemoryEnabled()) {
    return
  }

  const allowedTools = [
    'Read',
    'Glob',
    'Grep',
    'Bash',
    'Edit',
    'Write',
    'AskUserQuestion',
  ]

  registerBundledSkill({
    name: 'init-memory',
    description:
      'Initialize the hierarchical memory framework for this project. ' +
      'Scans project structure, infers a layered memory hierarchy, and creates the directory structure with LAYER.md files.',
    whenToUse:
      'Use /init-memory when first working with a project to set up a structured memory hierarchy. ' +
      'Also use it after /rebuild-memory-hierarchy or when the memory structure feels out of date.',
    argumentHint: '',
    userInvocable: true,
    isEnabled: () => isAutoMemoryEnabled(),
    allowedTools,
    disableModelInvocation: false,
    context: 'inline',
    async getPromptForCommand(args) {
      const memoryRoot = getAutoMemPath()
      const projectRoot = getOriginalCwd()
      const today = new Date().toISOString().split('T')[0]!

      let prompt = INIT_MEMORY_PROMPT
        .replace(/{MEMORY_ROOT}/g, memoryRoot)
        .replace(/{PROJECT_ROOT}/g, projectRoot)
        .replace(/{ISO_DATE}/g, today)

      if (args) {
        prompt += `\n\n## Additional context from user\n\n${args}`
      }

      return [{ type: 'text', text: prompt }]
    },
  })
}
