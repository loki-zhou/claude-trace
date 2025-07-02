# claude-trace

原始的仓库在:  https://github.com/badlogic/lemmy/blob/main/apps/claude-trace/README.md
原始的仓库不支持中文展示和自定义代理地址 增加2个小功能

记录你使用 Claude Code 开发项目时的所有交互。查看 Claude 隐藏的一切：系统提示、工具输出和原始 API 数据，并通过直观的网页界面展示。

## 安装

```bash
npm install -g @mariozechner/claude-trace  (原始的)
npm install -g @loki-zhou/claude-trace  (中文支持+自定义代理地址支持)
```

## 使用方法

```bash
# http://localhost:8082 为你claude code 代理地址
export CLAUDE_TRACE_API_ENDPOINT=http://localhost:8082

# 启动 Claude Code 并开始记录
claude-trace

# 记录所有 API 请求（默认只记录多消息对话）
claude-trace --include-all-requests

# 指定参数运行 Claude
claude-trace --run-with chat --model sonnet-3.5

# 显示帮助信息
claude-trace --help

# 提取 OAuth token
claude-trace --extract-token

# 手动生成 HTML 报告
claude-trace --generate-html logs.jsonl report.html

# 生成包含所有请求的 HTML 报告（不只是多消息对话）
claude-trace --generate-html logs.jsonl --include-all-requests

# 生成会话摘要和可搜索索引
claude-trace --index
```

日志将保存到当前目录下的 `.claude-trace/log-YYYY-MM-DD-HH-MM-SS.{jsonl,html}` 文件中。HTML 文件是自包含的，可在任意浏览器中打开，无需服务器支持。

## 请求过滤

默认情况下，claude-trace 会过滤日志以聚焦于重要对话：

- **默认行为**：仅记录 `/v1/messages` 接口且对话消息数超过 2 条的请求
- **添加 `--include-all-requests` 参数后**：记录所有向 `api.anthropic.com` 发出的请求，包括单次请求和其他接口

该过滤机制减少了日志文件大小，并专注于有意义的开发会话，同时仍允许在需要调试时捕获所有数据。

## 会话索引功能

生成 AI 驱动的编码会话摘要：

```bash
claude-trace --index
```

该功能会：

- 扫描 `.claude-trace/` 目录下的所有 `.jsonl` 日志文件
- 过滤有效对话（消息数大于 2、非压缩数据）
- 使用 Claude CLI 为每段对话生成标题和摘要
- 创建 `summary-YYYY-MM-DD-HH-MM-SS.json` 文件，包含对话元数据
- 生成主 `index.html` 文件，按时间顺序列出所有会话
- 直接链接到对应的单个对话 HTML 文件

**注意：** 索引功能会增加 API 调用次数，因为它需要调用 Claude 来生成摘要。

## 你会看到的内容

- **系统提示** - 查看 Claude 接收到的隐藏指令
- **工具定义** - 工具描述及参数列表
- **工具输出** - 文件读取、搜索、API 调用等原始数据
- **思考块** - Claude 的内部推理过程
- **Token 使用情况** - 包括缓存命中在内的详细统计
- **原始 JSONL 日志** - 完整的请求/响应对，便于分析
- **交互式 HTML 查看器** - 可浏览对话内容，并支持模型筛选
- **调试视图** - 原始调用显示所有 HTTP 请求，JSON 调试视图显示处理后的 API 数据
- **对话索引功能** - AI 生成的摘要和所有会话的可搜索索引

## 系统要求

- Node.js 16+
- 已安装 Claude Code CLI

## 开发指南

### 在开发模式下运行

```bash
# 安装依赖
npm install

# 启动开发模式
npm run dev
```

开发模式会监听 `src/` 和 `frontend/src/` 文件变化并自动编译。前端开发建议访问 `http://localhost:8080/test` 查看实时更新效果。

### 测试 CLI

```bash
# 测试已编译版本
node --no-deprecation dist/cli.js

# 直接测试 TypeScript 源码
npx tsx --no-deprecation src/cli.ts
```

### 构建项目

```bash
# 构建全部
npm run build

# 或者分别构建部分
npm run build:backend  # CLI 和拦截器
npm run build:frontend # 前端页面
```

**构建产物：**

- `dist/` - 编译后的 CLI 和拦截器 JavaScript 文件
- `frontend/dist/` - 打包好的网页界面（CSS + JS）
- 构建生成的 HTML 生成器，内嵌完整的网页界面

这些构建产物可用于 npm 发布，包括以下内容：

- 自包含的 HTML 报告（含内嵌 CSS/JS）
- Node.js CLI 和中间人代理拦截器
- TypeScript 类型定义

### 架构说明

**分为两个主要部分：**

1. **Backend (`src/`)**
   - **CLI** (`cli.ts`) - 命令行接口和参数解析。启动 Claude Code 并注入拦截器
   - **Interceptor** (`interceptor.ts`) - 注入到 Claude Code 中，拦截 fetch() 调用，并记录到 .claude-trace/ 目录下的 JSONL 文件中
   - **HTML Generator** (`html-generator.ts`) - 将前端嵌入为自包含 HTML 报告
   - **Index Generator** (`index-generator.ts`) - 创建 AI 会话摘要和索引
   - **Shared Conversation Processor** (`shared-conversation-processor.ts`) - 前后端共享的核心会话处理逻辑
   - **Token Extractor** (`token-extractor.js`) - 提取 Claude Code OAuth token 的简单拦截器

2. **Frontend (`frontend/src/`)**
   - **`app.ts`** - 主应用组件，处理数据和视图切换
   - **`index.ts`** - 应用入口点，注入 CSS 并初始化
   - **`types/claude-data.ts`** - API 数据结构的 TypeScript 接口
   - **`utils/data.ts`** - 处理原始 HTTP 对，重建 SSE 消息
   - **`utils/markdown.ts`** - Markdown 到 HTML 的转换工具
   - **`components/simple-conversation-view.ts`** - 主要会话显示组件
   - **`components/raw-pairs-view.ts`** - 原始 HTTP 流量查看器
   - **`components/json-view.ts`** - JSON 调试数据查看器
   - **`styles.css`** - Tailwind CSS 样式表，使用 VS Code 主题样式