# Git Manager（Antigravity 原生 Git 管理插件）

`git-manager` 是完全基于 Antigravity 官方插件与 Sidecar 规范构建的原生 Git 管理插件，无需修改 Antigravity 应用包体（零 ASAR 注入、零 DOM Hack、零第三方 npm 依赖），因此在 Antigravity 升级后依然可以稳定工作。

## 核心能力

1. **原生侧边栏 Git 面板（Aux Pane）**
   - 自动跟随当前对话工作区，支持单仓库、嵌套子仓库与多根工作区切换；非 Git 目录支持一键 `git init`。
   - **Changes（变更）**：分组展示已暂存 / 未暂存 / 未跟踪 / 冲突文件，支持单文件或全部暂存、取消暂存、安全丢弃、内联彩色 Diff 预览，并可一键调用 Antigravity 原生文件标签打开文件。
   - **Commit & Sync（提交与同步）**：支持提交说明、包含未暂存提交、Amend、Fetch、Pull（支持 `--rebase` 开关）、Push（自动设置上游与 `--force-with-lease` 安全强推开关）与一键 Sync。
   - **Branches（分支与 Worktree）**：新建分支、切换本地/远程跟踪分支、合并分支、删除分支、查看 `git worktree`。
   - **Stash（贮藏）**：保存（可选包含未跟踪文件）、Apply、Pop、Drop。
   - **History（历史）**：查看最近 50 条提交与详细 Diff、复制 Hash、安全回退最近提交到暂存区（`reset --soft HEAD~1`）或 `revert`。
   - **Activity Log**：底部实时记录执行的 `git` 命令、耗时与输出。
2. **深度复用 Antigravity Agent 能力**
   - 无需额外配置 API Key，直接将以下高阶任务委托给当前对话中的 Antigravity Agent：
     - **✨ AI 生成提交信息并提交**
     - **⚠️ AI 解决合并冲突**
     - **🔍 AI 审查当前改动**
     - **🚀 AI 创建 Pull Request**（结合本机 `gh` CLI）
     - **🩺 AI 排查 Git 命令报错**
3. **原生斜杠命令（Skills）**
   - `/git-commit`：智能检查变更、规避敏感文件并提交
   - `/git-sync`：安全 fetch / pull / push 同步工作流
   - `/git-workflow`：分支、Stash、回退与 PR 协作

## 目录结构

```text
git-manager/
├── plugin.json
├── README.md
├── install.sh
├── assets/logo.svg
├── rules/AGENTS.md
├── skills/
│   ├── git-commit/SKILL.md
│   ├── git-sync/SKILL.md
│   └── git-workflow/SKILL.md
├── sidecars/git_panel/
│   ├── package.json
│   ├── sidecar.json
│   ├── main.mjs
│   ├── git_service.mjs
│   └── public/
│       ├── index.html
│       ├── styles.css
│       └── app.js
└── test/
    └── git_service.test.mjs
```

## 安装与更新

在源码目录运行：

```bash
./install.sh
```

脚本会将运行时文件同步到 `~/.gemini/config/plugins/git-manager/`（不包含测试文件）。同步完成后，可在 Antigravity 的 **Customizations > Installed** 中管理该插件，并通过 **Overview > Plugins > Git** 或侧边栏 **+** 菜单打开面板。
