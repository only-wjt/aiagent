<div align="center">

# 🤖 AI Agent Desktop

**基于 Tauri + Vue 3 的全功能 AI Agent 桌面客户端**

[![GitHub](https://img.shields.io/badge/GitHub-only--wjt%2Faiagent-blue?logo=github)](https://github.com/only-wjt/aiagent)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8D8?logo=tauri)](https://tauri.app)
[![Vue](https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs)](https://vuejs.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## ✨ 功能特性

### 🔥 核心能力
- **多模型支持** — 同时接入 OpenAI、Anthropic、DeepSeek、Moonshot、硅基流动等主流 AI 供应商
- **流式对话** — 实时流式输出，支持 OpenAI Chat Completions 和 Anthropic Messages 两种 SSE 格式
- **智能路由** — 自动检测 Sidecar 可用性，无缝切换直连模式
- **多标签对话** — 浏览器式 Tab 管理，每个 Tab 独立维护对话上下文
- **对话持久化** — 所有对话自动保存到本地文件系统

### 🛠️ 实用工具
- **对话搜索** — 侧边栏实时搜索历史对话
- **导出 Markdown** — 一键导出对话为 `.md` 文件
- **右键菜单** — 对话重命名、导出、删除
- **快捷键** — `Ctrl+N` 新建 / `Ctrl+Shift+E` 导出 / `Ctrl+,` 设置
- **模型选择器** — 从 API 动态拉取可用模型列表，支持自定义模型

### 🎨 精致设计
- **深色 / 浅色主题** — 跟随系统或手动切换
- **Lucide 图标** — 全面采用 SVG 图标，精致一致
- **微动效** — 卡片悬停、菜单弹出等细腻动画
- **响应式布局** — 自适应窗口大小

### ⚙️ 可扩展
- **技能系统** — 内置编程助手、写作、翻译等技能，可自定义
- **MCP 工具** — 可接入外部工具服务
- **工作区** — 自定义工作区，数据持久化
- **统计面板** — 对话数、消息数、最常用模型等使用概况

---

## 🏗️ 技术架构

```
aiagent/
├── apps/desktop/          # 🖥️ Tauri + Vue 3 桌面应用
│   ├── src/
│   │   ├── components/    # TitleBar, Sidebar
│   │   ├── views/         # Home, Chat, Settings
│   │   ├── stores/        # Pinia 状态管理
│   │   ├── composables/   # useSidecar 等组合式函数
│   │   └── assets/        # 全局样式
│   └── src-tauri/         # Rust 后端（窗口管理、IPC、文件 I/O）
├── packages/shared/       # 📦 共享类型定义
│   └── src/types/         # Provider, Message, Session, Config
└── sidecar/               # 🔌 Node.js Sidecar 服务
    ├── src/adapters/      # OpenAI / Gemini 适配器
    └── src/agent/         # Agent 会话管理
```

| 层级 | 技术 | 职责 |
|------|------|------|
| **前端** | Vue 3 + Pinia + Vue Router | UI 渲染、状态管理、路由 |
| **桌面壳** | Tauri v2 (Rust) | 窗口控制、文件 I/O、IPC 通信 |
| **图标** | Lucide Vue | 统一 SVG 图标库 |
| **样式** | Vanilla CSS + CSS Variables | 主题系统、设计令牌 |
| **Sidecar** | Node.js + TypeScript | AI API 代理、SSE 转发 |

---

## 🚀 快速开始

### 环境要求

- **Node.js** >= 18
- **Bun** >= 1.0（包管理器）
- **Rust** >= 1.70（Tauri 编译）

### 安装与运行

```bash
# 克隆项目
git clone https://github.com/only-wjt/aiagent.git
cd aiagent

# 安装依赖
bun install

# 启动开发模式（Tauri 桌面应用）
cd apps/desktop
npm run tauri dev
```

### 配置 API Key

1. 启动应用后，进入 **设置 → 模型供应商**
2. 选择供应商（如 OpenAI、DeepSeek），输入 API Key
3. 点击 **🔄 获取模型** 加载可用模型
4. 勾选需要启用的模型
5. 回到对话页，在输入框左下角选择模型开始聊天

---

## 📸 截图

> 启动应用后可以看到：
> - 🏠 **首页** — 快捷提问、最近对话、工作区管理
> - 💬 **对话页** — 流式输出、模型选择、消息操作
> - ⚙️ **设置页** — 供应商配置、技能管理、统计面板

---

## 🗺️ 路线图

- [x] 多模型供应商支持（Anthropic / OpenAI / DeepSeek 等）
- [x] 流式对话（SSE）
- [x] 对话持久化与搜索
- [x] 导出对话为 Markdown
- [x] 多标签 Tab 管理
- [x] 快捷键系统
- [x] 右键菜单操作
- [x] 模型列表动态加载
- [x] Markdown 渲染引擎升级
- [x] 图片消息支持
- [x] 对话分叉（Fork）
- [x] 系统托盘集成
- [x] 插件系统（基于 MCP）

---

## 📄 License

[MIT](LICENSE) © only-wjt
