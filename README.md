# DeLong Code

> Claude Code 的一个 Fork。不是官方正史，而是平行世界番外篇；不是萌豚整活仓库，而是"认真修、顺手发癫一点点"的工程分支。

> **免责声明**：本项目仅供个人学习与技术研究，不得用于任何商业用途或非法用途。所有原始源码版权归 [Anthropic](https://www.anthropic.com) 所有。

[![Fork](https://img.shields.io/badge/Fork-Claude%20Code-f59e0b)](README.md)
[![Status](https://img.shields.io/badge/status-restored%20%2B%20modded-10b981)](README.md)
[![Runtime](https://img.shields.io/badge/runtime-Bun%20%2B%20Node-3b82f6)](README.md)
[![Config](https://img.shields.io/badge/config-~%2F.dl-8b5cf6)](README.md)
[![License](https://img.shields.io/badge/license-see%20upstream%20notice-lightgrey)](README.md)
[![Issues](https://img.shields.io/badge/issues-welcome-ef4444)](README.md)

![Preview](preview.png)

## 这是什么

[`DeLong Code`](README.md) 基于一份还原后的 [`Claude Code`](README.md) 源码树继续修改而来。

可以把它理解为：

- 基底仍然是"通过 source map 逆向还原 + 缺失模块补齐"得到的可运行代码树
- 但在此之上，加入了这个 Fork 自己的目标和行为调整
- 目标不是"100% 忠于上游"，而是"让它更适合折腾、适合代理转接、适合自定义模型接入"

如果用 ACG 比喻，大概属于：

- 原作：[`Claude Code`](README.md)
- 本作：[`DeLong Code`](README.md)
- 定位：不是官方 BD 修正集，而是高强度民间魔改但努力保持剧情逻辑自洽的外传 OVA

## 当前定位

这个仓库当前强调的是以下方向：

- 支持自定义 Anthropic 兼容接口地址
- 正在加入 OpenAI Chat Completions <-> Anthropic Messages 转接能力
- 支持自定义 API Key
- 支持自定义模型与模型列表管理
- 尽量把自定义接入数据收口到 [`~/.dl`](README.md) 路径体系
- 在保留 CLI/TUI 主体结构的前提下，降低对官方登录流的绑定

换句话说，它现在更像一个”可自托管 / 可代理 / 可转接”的 [`Claude Code`](README.md) 变体。

## 通用分层记忆框架（HMF）

本 Fork 加入了**通用分层记忆框架（Hierarchical Memory Framework, HMF）**，用于在项目中长期积累、组织和联想式检索记忆。

### 核心能力

- **分层存储**：根据项目结构自动创建层级目录，将记忆按主题/模块/层级组织
- **向下扩展联想**：复杂查询时从父层递归搜索到子层，支持多分支保留（gap <= 15）
- **自适应召回**：简单查询自动走扁平召回（~1s），复杂查询才走分层召回
- **自动初始化**：通过 `/init-memory` skill 一键扫描项目结构并生成分层框架
- **智能整理**：Append 模式支持合并相似文件、拆分复杂文件、归档到对应层级

### 使用方法

**首次使用项目时初始化分层记忆：**

```bash
/init-memory
```

如果已有记忆文件，会弹出交互式选择：

- **Overwrite**：重建分层结构（保留旧文件）
- **Append**：分析并整理现有文件到对应层级
- **Cancel**：取消操作

**后续自动工作：**

- 每回合对话结束后，自动提取记忆到对应层级
- 定期 `/dream` 整合记忆，维护层级结构和索引
- 复杂查询自动触发分层联想召回

### 技术实现要点

| 模块 | 说明 |
|------|------|
| `findHierarchicalMemories.ts` | 4 阶段召回算法（快速路径 → 根层评估 → 向下扩展 → 文件选择） |
| `classifyQueryComplexity()` | 启发式分类：simple 走扁平，complex 走分层 |
| `LAYER.md` | 每层描述文件，混合格式（markdown + json:sublayers） |
| `initMemory.ts` | `/init-memory` skill，支持交互式选择 + Append 整理 |
| `memoryTypes.ts` | 扩展 frontmatter：layer, scope, complexity, related 等字段 |

记忆默认存储路径：`~/.dl/projects/<project-name>/memory/`

## 与原版 Claude Code 的数据隔离

[`DeLong Code`](README.md) 默认**不应**与原版 [`Claude Code`](README.md) 共用配置和缓存目录。

当前 Fork 已明确把默认用户目录收口到：

- 配置目录：[`~/.dl`](README.md)
- 全局配置文件：[`~/.dl/.claude.json`](README.md)

这样做的目的，是避免以下问题：

- 原版 [`Claude Code`](README.md) 的登录态污染 [`DeLong Code`](README.md)
- 原版保存的 endpoint / token / model 配置影响 Doge 的代理转接逻辑
- 两边共用 [`.claude.json`](README.md) 或 [`.claude/`](README.md) 导致奇怪的网络、认证、模型或 UI 异常

如果用户以前装过原版 [`Claude Code`](README.md)，再运行 [`DeLong Code`](README.md) 时出现"明明没这么配却读到了旧配置"的现象，通常就是历史数据混用导致的。

建议：

- 原版继续使用它自己的 [`.claude`](README.md) / [`.claude.json`](README.md)
- [`DeLong Code`](README.md) 使用 [`.dl`](README.md) 目录
- 如需手动指定，也可以通过 [`CLAUDE_CONFIG_DIR`](README.md) 为 [`DeLong Code`](README.md) 指向独立目录

一句话总结：

> 原版走原版的窝，狗子住狗子的窝，别把缓存、认证和配置炖成一锅。

## OpenAI 兼容接口说明

[`DeLong Code`](README.md) 正在加入一个"中间转接层"模式，用来让内部仍按 Anthropic Messages 结构工作的主逻辑，转发到 OpenAI Chat Completions 接口。

目标行为是：

- 内部程序仍按 Anthropic Messages 模式组织请求
- 当选择 OpenAI API 格式时，由中间层把 Messages 请求改写成 Chat Completions 请求
- 远端返回 Chat Completions 流后，再由中间层回转成内部可消费的 Messages 风格流事件

这意味着它不是简单改一个 Base URL，而是协议级别的输入输出流转接。

当前状态：

- API 格式选择界面与配置持久化已加入
- OpenAI 兼容转接模块正在迭代中
- 目前仍属于开发中功能，可能出现流式事件不完整、消息映射异常、部分工具调用兼容不足等情况

如果你只是想稳定使用，建议优先走 Anthropic 兼容接口模式；如果你在测试 OpenAI 格式，请把它视为实验功能。

## 和原始还原仓库的关系

这个仓库**不是**上游官方源码仓库，也**不是** pristine 状态的 Claude Code。

它有两层历史：

1. 第一层：还原后的源码树
2. 第二层：基于该源码树继续进行的 Fork 改造

因此你会看到两类差异同时存在：

- 来自恢复过程的 shim、fallback、兼容层
- 来自 DeLong Code 的主动魔改

这两类改动都是真实存在的，不建议把当前代码误判成"官方上游源码镜像"。

## 当前状态

- 该源码树已经可以在本地开发流程中恢复并运行
- [`bun install`](README.md) 可用于安装依赖
- [`bun run dev`](README.md) 可用于启动恢复后的 CLI/TUI
- [`bun run version`](README.md) 可用于输出当前版本信息
- 项目已被继续改造成 [`DeLong Code`](README.md) 分支，部分行为和 UI 已不再与原始 Claude Code 一致
- 部分区域仍保留恢复期 fallback，因此行为可能与上游实现不同
- OpenAI API 格式转接功能仍在开发中，当前并非完全稳定

## 为什么会有这个仓库

因为 source map 并不能召唤完整原仓库，最多只能说"把灵魂碎片召回来一部分"。

常见缺口包括：

- 类型专用文件缺失
- 构建产物和中间文件缺失
- 私有包包装层无法恢复
- 原生绑定无法恢复
- 动态导入资源不完整

因此这个仓库的目标从一开始就不是考古式供奉，而是：

- 先恢复到可运行
- 再恢复到可维护
- 最后在能跑的基础上，按需求继续 Fork

简而言之：

> 先让它活，再让它能打，再让它变成狗。

## 运行方式

环境要求：

- Bun 1.3.5 或更高版本
- Node.js 24 或更高版本

安装依赖：

```bash
bun install
```

## 快速安装（推荐开发者直接源码使用）

如果你是直接拉这个仓库源码来用，最快的方式是用 [`bun link`](README.md) 把它注册成全局命令。

### 方式一：源码目录内直接注册

在仓库根目录执行：

```bash
bun install
bun link
```

注册成功后：

- 全局包名是 [`@dl-code/cli`](package.json:2)
- 命令名是 [`dl`](package.json:24)

此后可直接运行：

```bash
dl
```

### 方式二：在其他项目中引用 link 包

如果你要在别的工程里依赖它，可以使用：

```bash
bun link @dl-code/cli
```

或者在 [`package.json`](package.json) 中写：

```json
{
  "dependencies": {
    "@dl-code/cli": "link:@dl-code/cli"
  }
}
```

## 使用 Git 直接源码级更新

这个 Fork 很适合直接通过 Git 拉取更新，而不是走传统已发布包升级。

典型更新流程：

```bash
git pull
bun install
bun link
```

含义分别是：

- [`git pull`](README.md)：拉取最新源码改动
- [`bun install`](README.md)：同步依赖变化
- [`bun link`](README.md)：刷新全局 link 注册，确保命令入口与当前源码一致

如果你本地就是长期用源码目录跑 [`DeLong Code`](README.md)，这基本就是"源码级更新"的标准姿势。

### 一个推荐工作流

首次安装：

```bash
git clone <your-fork-or-repo-url>
cd claude-code-rev
bun install
bun link
dl
```

后续更新：

```bash
git pull
bun install
bun link
dl
```

## 命令与包名

运行 [`DeLong Code`](README.md) CLI：

```bash
bun run dev
```

安装为全局命令后，默认命令名为：

```bash
dl
```

也就是说，这个 Fork 现在的目标入口名是 [`dl`](README.md)，而不是 [`claude`](README.md)。

如果你使用 [`bun link`](README.md) 进行全局注册链接，那么现在注册出来的包名也不再是原版名，而是：

```bash
@dl-code/cli
```

输出版本号：

```bash
bun run version
```

## Buddy 宠物系统用法

这个 Fork 内置了一个名为 [`Buddy`](README.md) 的小企鹅宠物，会显示在输入框旁边，并在部分对话后冒泡吐槽或打气。

常用命令如下：

- 启用 / 唤出 Buddy：

```bash
/buddy
```

- 摸摸 Buddy（触发爱心动画）：

```bash
/buddy pet
```

- 临时关闭 Buddy（静音，不再显示冒泡）：

```bash
/buddy mute
```

- 重新打开 Buddy：

```bash
/buddy unmute
```

- 查看命令帮助：

```bash
/buddy help
```

补充说明：

- 当前这份 Fork 已默认带一个可用的 Buddy，通常启动后就是开启状态
- [`/buddy mute`](README.md) 是"关闭显示和冒泡"，不是删除宠物数据
- [`/buddy unmute`](README.md) 会恢复显示
- 如果你在聊天里直接提到 `Buddy`，它有时会自己在气泡里回应

## 本地sglang模型接入说明

第一次启动默认会进入/login，最新版SGLANG可以直接选择1.0 Anthropic格式的API请求
输入https://127.0.0.1:8000（本地sglang服务端口）,模型名称自定义
模型名称自定义

## 更新日志

以下是基于 commit 历史的更新线。时间由近到远排列，每个阶段标注了主要改动方向。

### 2026-05-08 — DeepSeek 兼容修复

- **fix**: `user_id` 字段从 JSON 对象序列化改为纯 hex 字符串，修复 DeepSeek API `400 Invalid user_id` 错误（正则要求 `^[a-zA-Z0-9_-]+$`）

### 2026-05-06 — 模型管理与竞争对比

- **feat**: 模型注册表（model registry）、第三方 token 计数、每模型独立 endpoint 配置
- **feat**: 新增 `/compete` 命令，支持并行多方案对比
- **fix**: thinking 流显示修复、plan mode 焦点恢复

### 2026-04-25 — Coordinator 通信完善

- **feat**: Commander 可用工具集加入 Skill tool
- **fix**: Worker-to-Commander SendMessage 通道打通
- **fix**: `loadFullLog` 因缺失 `permissionModes` 静默返回空消息

### 2026-04-24 — Agent 多智能体基础设施

- **feat**: 引入 teammate 基础设施支撑 coordinator agent 生命周期
- **feat**: 强制为所有 agent 注入 SendMessage 工具与 skill 使用指导
- **feat**: coordinator agent 空闲循环（idle loop）与 team 文件自动创建
- **fix**: 避免 coordinator 模式下 permission deadlock
- **fix**: 将完整 tool pool 传给 worker，而非过滤后的 coordinator 工具集
- **debug**: 补充大量 coordinator 运行期日志

### 2026-04-19 — Coordinator 目标追踪与可见性

- **feat**: Coordinator 模式迭代分解 + 目标追踪（goal tracking）
- **feat**: 非 coordinator 模式也加入目标追踪指导
- **feat**: 后台任务可见性增强、`AgentViewHeader` 查看 LocalAgentTask 转录
- **feat**: `/dream` skill 用于睡眠模拟
- **feat**: `GoalReminderDetector` 长任务提醒 + `queueAndDisplayMessage` 可见提醒

### 2026-04-15 — 目录重构与 Coordinator 模式启动

- **refactor**: 项目级配置目录统一为 `.claude/`，用户级保留 `.dl/`
- **feat**: 新增 `/coordinator` 命令开启 coordinator 多智能体模式
- **fix**: 移除 feature gate，默认可用 coordinator 模式

### 2026-04-11 ~ 04-12 — 权限与队列

- **feat**: Focus mode（自动批准非危险命令）
- **feat**: `/queue` 顺序任务执行
- **feat**: WebFetch 白名单扩展、与 Anthropic API 解耦、模型环境变量处理优化
- **fix**: Focus mode 对危险删除路径仍然弹窗确认

### 2026-04-03 ~ 04-08 — API 生态与多模态

- **feat**: 本地模型后端（Local Model Backend）
- **feat**: Windows 平台 `computer-use` MCP 支持
- **feat**: macOS `computer-use` 修复
- **feat**: 多模态输入支持
- **feat**: 思考块（thinking block）实现
- **feat**: Responses API 支持（实验性）
- **feat**: Gemini API 支持
- **feat**: 为新增 API 接入 effort 控制
- **feat**: OpenAI API 格式思考字段输出
- **feat**: Buddy 宠物系统完善
- **fix**: WebSearch 修复（需重新 `bun install`）
- **fix**: Linux 下 `bun link` 后启动脚本被 shell 误识别问题
- **fix**: `Unable to connect to Anthropic services` 连接问题
- **refactor**: 所有 `.claude/` 目录重命名为 `.dl/`
- **refactor**: 进一步切断外发遥测主链

### 2026-04-01 ~ 04-02 — 项目初始化与 OpenAI 兼容

- **init**: DeLong Code 首次出场
- **feat**: 完美兼容 OpenAI API 格式
- **feat**: 所有模型可用 SubAgent
- **feat**: Agent 调用时显示模型真实名称
- **feat**: OpenAI thinking 预算：Low=1024 / Medium=4096 / High=8192 / None=关闭
- **refactor**: 移除收集隐私的监控
- **refactor**: 防蒸馏监控去除
- **refactor**: 全局包名改为 `@dl-code/cli`，默认命令名改为 `dl`

## 说明与免责声明

- 本仓库是 [`Claude Code`](README.md) 的 Fork：[`DeLong Code`](README.md)
- 它包含恢复期代码与后续 Fork 改动，不代表官方立场
- 如果某些行为看起来"很像官方，但又不完全像"，那通常不是你看错了，而是这确实是恢复版 + 魔改版的叠加态
- 如果某些文案偶尔带一点 ACG 味，那是彩蛋，不是类型系统坏掉了（至少不全是）
