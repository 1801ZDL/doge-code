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
- If MEMORY.md or any .md files exist, report them to the user and ask whether to overwrite, append, or cancel.
- If the directory is empty or does not exist, proceed directly.

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

After creating everything, report to the user:
1. How many top-level layers were created.
2. How many total layers (including sub-layers).
3. Maximum depth of the hierarchy.
4. The names of all top-level layers.
5. A confirmation message: "Hierarchical memory framework initialized. You can now start recording memories. Use /dream to consolidate memories periodically."

## Tool Constraints

You have access to: Read, Glob, Grep, Bash, Edit, Write.
- Use Glob for scanning, Read for config files, Write for creating LAYER.md and MEMORY.md, Bash for mkdir.
- Do NOT modify any files outside the memory directory.
- Do NOT read source code files (only config files and README/CLAUDE.md).
- If the memory directory already has content and the user did not confirm overwrite, STOP and report what exists.
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
