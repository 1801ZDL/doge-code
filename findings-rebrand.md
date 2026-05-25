# DeLong Code 全面转型调查 findings

## 调查目标
将 doge-code 项目从基于 Claude Code 的 Fork 全面转型为 DeLong Code（dl-code），识别所有需要：
1. **替换**（claude/doge → DeLong/dl）
2. **删除**（与 Anthropic 官方服务绑定的功能）
3. **保留**（通用模块化功能）

---

## 一、需要替换的文件名（含 claude/doge）

### 1. 目录/包名
| 当前路径 | 建议新名 | 类型 |
|----------|----------|------|
| `packages/@ant/claude-for-chrome-mcp/` | `packages/@ant/browser-mcp/` 或 `dl-for-chrome-mcp` | 保留功能，去品牌 |
| `shims/ant-claude-for-chrome-mcp/` | `shims/ant-browser-mcp/` | shim对应 |
| `src/utils/claudeInChrome/` | `src/utils/browserIntegration/` | Chrome集成通用化 |
| `src/skills/bundled/claude-api/` | `src/skills/bundled/anthropic-api/` 或 `dl-api/` | API文档技能 |

### 2. 源文件名
| 当前路径 | 建议新名 |
|----------|----------|
| `src/services/api/claude.ts` | `src/services/api/anthropic.ts` 或 `dlApi.ts` |
| `src/services/claudeAiLimits.ts` | `src/services/apiLimits.ts` |
| `src/services/mcp/claudeai.ts` | `src/services/mcp/remoteMcpServers.ts` |
| `src/utils/claudemd.ts` | `src/utils/memoryLoader.ts` 或保留（已成通用名词） |
| `src/skills/bundled/claudeApi.ts` | `src/skills/bundled/anthropicApiSkill.ts` |
| `src/hooks/usePromptsFromClaudeInChrome.tsx` | `src/hooks/usePromptsFromBrowser.tsx` |
| `src/tools/AgentTool/built-in/claudeCodeGuideAgent.ts` | `src/tools/AgentTool/built-in/dlCodeGuideAgent.ts` |

---

## 二、需要替换的代码内容分类

### A. 品牌/显示文本（高优先级）

**1. 系统提示前缀** (`src/constants/system.ts`)
```typescript
// 当前（约第10行）
const DEFAULT_PREFIX = `You are Claude Code, Anthropic's official CLI for Claude.`
const AGENT_SDK_DL_CODE_PRESET_PREFIX = `You are Claude Code...`
const AGENT_SDK_PREFIX = `You are a Claude agent, built on Anthropic's Claude Agent SDK.`
```
→ 替换为 DeLong Code 品牌

**2. 模型显示名称** (`src/utils/model/model.ts:379-385`)
```typescript
export function getPublicModelName(model: ModelName): string {
  return `Claude ${renderModelName(model)}`  // → "DeLong ${model}"
}
```

**3. 订阅名称** (`src/utils/auth.ts:1719-1733`)
```typescript
export function getSubscriptionName(): string {
  case 'enterprise': return 'Claude Enterprise'  // → 'DeLong Enterprise'
  case 'team': return 'Claude Team'              // → 'DeLong Team'
  case 'max': return 'Claude Max'                // → 'DeLong Max'
  case 'pro': return 'Claude Pro'                // → 'DeLong Pro'
  default: return 'Claude API'                   // → 'DeLong API'
}
```

**4. 命令描述** (`src/commands/` 各目录)
- `src/commands/model/index.ts`: "Set the AI model for Claude Code"
- `src/commands/statusline.tsx`: "Set up Claude Code's status line UI"
- `src/commands/init-verifiers.ts`: 多处 "Claude Chrome Extension"

**5. UI 组件中的品牌引用** (`src/components/`)
- `ConsoleOAuthFlow.tsx`: "Claude Code login successful", "your Claude account"
- `Onboarding.tsx`, `Message.tsx`, `Feedback.tsx` 等

**6. README / 文档**
- `README.md`: 大量 "Claude Code" 引用（虽然很多是说明 Fork 来源，需保留说明但更新当前状态）
- `package.json`: `description`, `repository.url`

### B. 环境变量（ANTHROPIC_ / CLAUDE_ 前缀）

| 当前变量名 | 建议新名 | 位置 |
|------------|----------|------|
| `ANTHROPIC_MODEL` | `DL_MODEL` | `src/utils/model/model.ts:63,73` |
| `ANTHROPIC_BASE_URL` | `DL_BASE_URL` | `src/services/api/client.ts`, `src/utils/model/providers.ts` |
| `ANTHROPIC_SMALL_FAST_MODEL` | `DL_SMALL_FAST_MODEL` | `src/utils/model/model.ts:41` |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | `DL_DEFAULT_OPUS_MODEL` | `src/utils/model/model.ts:110` |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | `DL_DEFAULT_SONNET_MODEL` | `src/utils/model/model.ts:124` |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | `DL_DEFAULT_HAIKU_MODEL` | `src/utils/model/model.ts:136` |
| `ANTHROPIC_AUTH_TOKEN` | `DL_AUTH_TOKEN` | `src/services/api/client.ts:360` |
| `ANTHROPIC_CUSTOM_HEADERS` | `DL_CUSTOM_HEADERS` | `src/services/api/client.ts:369` |
| `ANTHROPIC_FOUNDRY_API_KEY` | `DL_FOUNDRY_API_KEY` | `src/services/api/client.ts:206` |
| `ANTHROPIC_FOUNDRY_BASE_URL` | `DL_FOUNDRY_BASE_URL` | `src/services/api/client.ts:47` |
| `ANTHROPIC_FOUNDRY_RESOURCE` | `DL_FOUNDRY_RESOURCE` | - |
| `ANTHROPIC_VERTEX_PROJECT_ID` | `DL_VERTEX_PROJECT_ID` | `src/services/api/client.ts:296` |
| `ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION` | `DL_SMALL_FAST_MODEL_AWS_REGION` | `src/services/api/client.ts:168` |
| `CLAUDE_AGENT_SDK_CLIENT_APP` | `DL_AGENT_SDK_CLIENT_APP` | `src/services/api/client.ts:109` |
| `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR` | `DL_BASH_MAINTAIN_PROJECT_WORKING_DIR` | `src/utils/envUtils.ts:112` |

**注意**：需要保持向后兼容，建议同时读取新旧变量名（新变量优先）。

### C. 配置文件中的字段名

| 当前字段 | 位置 |
|----------|------|
| `claudeInChromeDefaultEnabled` | `src/utils/config.ts:504` |
| `hasCompletedClaudeInChromeOnboarding` | `src/utils/config.ts:503` |
| `cachedChromeExtensionInstalled` | `src/utils/config.ts:505` |
| `claudeAiMcpEverConnected` | `src/utils/config.ts:221` |
| `claudeCodeHints` | `src/utils/config.ts:521` |
| `claudeCodeFirstTokenDate` | `src/utils/config.ts:405` |
| `primaryApiKey` (注释: "set via oauth") | `src/utils/config.ts:232` |

### D. 函数/变量/类型名

| 当前名 | 建议新名 | 位置 |
|--------|----------|------|
| `getClaudeConfigHomeDir()` | `getDlConfigHomeDir()` | `src/utils/envUtils.ts:7` |
| `getClaudeAIOAuthTokens()` | `getDlOAuthTokens()` | `src/utils/auth.ts` |
| `isClaudeAISubscriber()` | `isDlSubscriber()` | `src/utils/auth.ts:1569` |
| `getClaudeAiUserDefaultModelDescription()` | `getDlUserDefaultModelDescription()` | `src/utils/model/model.ts:290` |
| `shouldEnableClaudeInChrome()` | `shouldEnableBrowserIntegration()` | `src/utils/claudeInChrome/setup.ts:39` |
| `setupClaudeInChrome()` | `setupBrowserIntegration()` | `src/utils/claudeInChrome/setup.ts:91` |
| `getMemoryPath('User')` 返回 `~/.dl/CLAUDE.md` | 返回 `~/.dl/DL.md` 或保留 | `src/utils/config.ts:1801` |
| `isMemoryFilePath()` 中的 `CLAUDE.md` | `DL.md` | `src/utils/claudemd.ts:1435` |

---

## 三、建议删除的部分（Anthropic 官方绑定功能）

### 1. OAuth/登录系统（核心删除项）

**原因**：这些功能依赖 Anthropic 官方的 claude.ai OAuth 服务、订阅系统、组织管理。

| 文件/目录 | 说明 |
|-----------|------|
| `src/services/oauth/` | 整个 OAuth 客户端（token 刷新、profile 获取） |
| `src/commands/login/` | `/login` 命令 |
| `src/commands/logout/` | `/logout` 命令 |
| `src/components/ConsoleOAuthFlow.tsx` | OAuth 登录 UI |
| `src/utils/auth.ts` 中的订阅相关 | `isClaudeAISubscriber()`, `getSubscriptionType()`, `isMaxSubscriber()`, `isProSubscriber()`, `isTeamPremiumSubscriber()`, `getSubscriptionName()`, `isOverageProvisioningAllowed()` 等 |
| `src/services/claudeAiLimits.ts` | Claude.ai API 限制 |
| `src/utils/billing.ts` | 账单相关 |

### 2. Claude.ai MCP 连接器

| 文件 | 说明 |
|------|------|
| `src/services/mcp/claudeai.ts` | 从 claude.ai 获取组织 MCP 配置 |

### 3. GitHub App / Slack App 安装命令

| 文件/目录 | 说明 |
|-----------|------|
| `src/commands/install-github-app/` | 安装 Claude GitHub App（依赖 claude.ai OAuth） |
| `src/commands/install-slack-app/` | 安装 Claude Slack App |

### 4. 订阅相关命令

| 文件/目录 | 说明 |
|-----------|------|
| `src/commands/cost/` | 查询用量成本（依赖 Claude AI 订阅） |
| `src/commands/extra-usage/` | 额外用量购买 |
| `src/commands/fast/` | Fast mode（Claude AI 订阅功能） |
| `src/commands/passes/` | Guest passes（邀请系统） |

### 5. 遥测/分析（发送数据到 Anthropic）

| 文件/目录 | 说明 |
|-----------|------|
| `src/services/analytics/` | 第一方分析事件发送 |
| `src/utils/telemetry/` | OpenTelemetry 导出到 Anthropic BigQuery |
| GrowthBook/Statsig 集成 | `src/services/analytics/growthbook.ts` |

### 6. Claude.ai 桥接/远程控制

| 文件/目录 | 说明 |
|-----------|------|
| `src/bridge/` 部分功能 | 与 claude.ai 的远程桥接 |
| `src/commands/bridge/` | `/bridge` 命令 |
| `src/commands/review/` | 依赖 Claude Code on the web |

### 7. 原生安装器/自动更新

| 文件/目录 | 说明 |
|-----------|------|
| `src/utils/nativeInstaller/` | 原生包管理器安装（面向官方分发） |
| `src/cli/update.ts` | 自动更新检查 |

---

## 四、建议保留的部分（通用模块化功能）

### 1. Computer Use（保留，通用自动化）
- `packages/@ant/computer-use-mcp/`
- `packages/@ant/computer-use-input/`
- `packages/@ant/computer-use-swift/`
- `src/utils/computerUse/`
- **建议**：将包名中的 `@ant/` 前缀改为 `@dl/` 或 `@dl-code/`

### 2. Chrome/浏览器集成（保留，重命名）
- 功能：通过 Chrome 扩展进行浏览器自动化
- **建议**：将 "Claude in Chrome" 重命名为 "Browser MCP" 或 "DL Browser"
- 保留 `src/utils/claudeInChrome/` 目录但改名为 `src/utils/browserIntegration/`

### 3. MCP 框架（保留）
- `src/services/mcp/`（除 `claudeai.ts`）
- MCP 客户端、配置、类型定义

### 4. 核心 CLI/TUI（保留）
- `src/main.tsx`
- `src/screens/REPL.tsx`
- `src/components/`（更新品牌文本）
- `src/ink/` 终端 I/O

### 5. 工具系统（保留）
- `src/tools/` 全部
- Bash、FileRead/Write/Edit、Glob、Grep、WebFetch、WebSearch 等

### 6. Agent/Subagent/Coordinator（保留）
- `src/tools/AgentTool/`
- `src/coordinator/`
- `src/tasks/`
- `src/utils/swarm/`

### 7. HMF 分层记忆（保留）
- `src/utils/memdir/`
- `src/skills/bundled/updateConfig.ts`（/dream, /init-memory）

### 8. 自定义模型系统（已存在，保留）
- `src/commands/add-model/`
- `src/commands/remove-model/`
- `src/utils/customApiStorage.ts`
- `src/utils/model/`（更新环境变量名）

### 9. API 兼容性层（保留）
- `src/services/api/openaiCompat.ts`
- `src/services/api/geminiCompat.ts`
- `src/services/api/openaiResponsesCompat.ts`

### 10. 第三方 Provider SDK（保留但简化）
- `@anthropic-ai/sdk` - 核心 SDK（保留，因为 API 格式兼容需要）
- `@anthropic-ai/bedrock-sdk` - Bedrock（保留）
- `@anthropic-ai/vertex-sdk` - Vertex（保留）
- `@anthropic-ai/foundry-sdk` - Foundry（保留）
- **建议**：这些 SDK 只是协议封装，可以保留。但可考虑统一为通用 HTTP 客户端。

---

## 五、关键决策点

### 1. CLAUDE.md 文件命名
**现状**：项目使用 `CLAUDE.md` 作为记忆/指令文件的标准名，`.claude/rules/*.md`
**选项**：
- A) 保持 `CLAUDE.md`（已成行业通用约定，类似 `.gitignore`）
- B) 改为 `DL.md` / `.dl/rules/*.md`（彻底去品牌）
- **建议**：A) 保持，因为用户生态系统已广泛采用 `CLAUDE.md` 作为标准

### 2. 模型名称常量
**现状**：`src/utils/model/configs.ts` 中定义 `CLAUDE_3_7_SONNET_CONFIG`, `CLAUDE_OPUS_4_CONFIG` 等
**选项**：
- A) 保持（这些是 Anthropic 官方模型 ID，不是品牌问题）
- B) 改为通用命名（`MODEL_OPUS_4_CONFIG`）
- **建议**：A) 保持，因为这些常量映射的是真实的 API 模型 ID（如 `claude-opus-4-6`）

### 3. OAuth 系统是否完全删除
**现状**：`src/utils/auth.ts` 中 OAuth 逻辑与 API key 逻辑深度耦合
**选项**：
- A) 完全删除 OAuth 相关代码
- B) 保留框架但移除 Anthropic 特定实现
- **建议**：A) 完全删除，因为 DeLong Code 的定位是"自托管/可代理"，不需要官方 OAuth

### 4. 向后兼容的环境变量
**建议**：同时支持新旧环境变量名至少一个版本周期，例如：
```typescript
const apiKey = process.env.DL_API_KEY || process.env.ANTHROPIC_API_KEY
```

---

## 六、实施优先级建议

### Phase 1: 核心品牌替换（影响用户可见）
1. 系统提示前缀 (`src/constants/system.ts`)
2. 命令描述和帮助文本 (`src/commands/`)
3. UI 组件中的品牌名 (`src/components/`)
4. README.md
5. package.json description

### Phase 2: 环境变量和配置
1. 新增 `DL_*` 环境变量支持
2. 保留旧变量向后兼容
3. 配置文件字段重命名

### Phase 3: 文件名和目录结构
1. 重命名文件和目录
2. 更新所有 import 路径
3. 更新 package.json 中的 bin/scripts

### Phase 4: 删除 Anthropic 绑定功能
1. OAuth/登录系统
2. 遥测/分析
3. 订阅相关命令
4. 自动更新

### Phase 5: 依赖清理
1. 移除不再需要的 `@anthropic-ai/*` 包（如果完全不用官方 API）
2. 或者保留但改为可选依赖

---

## 七、统计

- **涉及文件总数**：~200+ 个源文件（排除 node_modules/.git）
- **包含 "claude" 的文件**：~180 个
- **包含 "doge" 的文件**：~3 个（主要是历史遗留）
- **需要重命名的文件**：~15 个
- **需要删除的目录**：~10 个
- **需要替换的环境变量**：~15 个

---

## Phase 4 实施记录 (2026-05-25)

### 已删除
- `src/commands/cost/` → 重建为空壳（保留 /cost 命令接口，本地成本跟踪）
- `src/commands/extra-usage/` → 删除+重建空壳
- `src/commands/passes/` → 删除
- `src/commands/install-github-app/` → 删除+保留 types.ts 空壳
- `src/services/claudeAiLimits.ts` → 删除原文件，重建 `.ts` 空壳

### 已精简为空壳
- `src/services/analytics/growthbook.ts` → 所有函数返回默认值
- `src/services/analytics/config.ts` → `isAnalyticsDisabled()/isFeedbackSurveyDisabled()` 返回 true
- `src/services/analytics/datadog.ts` → shutdown/init/track 空实现
- `src/services/analytics/sink.ts` → 空实现
- `src/services/oauth/index.ts` → OAuthService 类抛出异常
- `src/services/oauth/client.ts` → 所有函数返回 null/false/空
- `src/services/oauth/getOauthProfile.ts` → 返回 null/undefined
- `src/services/mcp/claudeai.ts` → fetchClaudeAIMcpConfigsIfEligible 返回 {}

### 编译修复记录
- `src/main.tsx:103` — 删除 `checkQuotaStatus` 导入和调用
- `src/main.tsx:151` — 删除 `fetchClaudeAIMcpConfigsIfEligible` 导入
- `src/main.tsx:153` — 删除 `dedupClaudeAiMcpServers` 从 config.js 导入
- `src/main.tsx:1797-2810` — 替换 claude.ai MCP 连接流程为跳过
- `src/main.tsx:2366` — 删除 `checkQuotaStatus()` 调用
- `src/commands.ts` — 删除 cost/passes/extraUsage/installGitHubApp 导入和注册
- `src/services/api/errors.ts:47-51` — 拆分为 `claudeAiLimits.ts` 类型导入 + `rateLimitMessages.ts` 函数导入
- `src/services/claudeAiLimits.ts` — 逐步追加缺失导出（ClaudeAILimits, OverageDisabledReason, extractQuotaStatusFromError, extractQuotaStatusFromHeaders, getRateLimitWarning, getUsingOverageText, getRawUtilization）
- `src/hooks/notifs/useMcpConnectivityStatus.tsx` — 依赖 claudeai.ts 空壳的 `hasClaudeAiMcpEverConnected`

---

## Phase 3 补充: 文件重命名 (2026-05-25)

### claudeInChrome → browserIntegration
- `src/utils/claudeInChrome/` → `src/utils/browserIntegration/` ✅
- `src/skills/bundled/claudeInChrome.ts` → `browserIntegration.ts` ✅
- `src/hooks/usePromptsFromClaudeInChrome.tsx` → `usePromptsFromBrowserIntegration.tsx` ✅
- `src/components/ClaudeInChromeOnboarding.tsx` → `BrowserIntegrationOnboarding.tsx` ✅
- MCP 协议名 `claude-in-chrome` 保留不变（Chrome 扩展兼容）
- 118 处引用通过 sed 批量更新

### claude-api → dl-api
- `src/skills/bundled/claude-api/` → `src/skills/bundled/dl-api/` ✅
- `src/skills/bundled/claudeApi.ts` → `dlApi.ts` ✅
- `src/skills/bundled/claudeApiContent.ts` → `dlApiContent.ts` ✅
- 所有导入路径和函数名通过 sed 批量更新

### claudeCodeGuideAgent → dlCodeGuideAgent
- `src/tools/AgentTool/built-in/claudeCodeGuideAgent.ts` → `dlCodeGuideAgent.ts` ✅
- Agent prompt 内容完全重写
