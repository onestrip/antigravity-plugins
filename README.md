# Antigravity Plugins (`antigravity-plugins`)

存放 Google Antigravity（AGY）原生插件的集合仓库，所有插件均基于 Antigravity 官方插件、Sidecar、Skills 与 Rules 规范开发（零侵入应用包体、不依赖第三方 npm 包，升级后依然稳定可用）。

## 插件清单

| 插件目录 | 显示名称 | 说明 | 安装方式 |
| --- | --- | --- | --- |
| [`git-manager`](./git-manager) | **Git Manager** | 原生侧边栏 Git 管理面板（暂存、内联 Diff、提交、拉取、推送、同步、分支、Worktree、Stash、历史回退）+ Antigravity Agent AI 协作（AI 提交、解决冲突、审查改动、创建 PR、排查报错）+ `/git-commit`、`/git-sync`、`/git-workflow` 斜杠技能 | `cd git-manager && ./install.sh` |

## 目录约定

```text
antigravity-plugins/
├── README.md
├── .gitignore
└── <plugin-name>/
    ├── plugin.json
    ├── README.md
    ├── install.sh
    ├── assets/
    ├── rules/
    ├── skills/
    ├── sidecars/
    └── test/
```

## 快速安装

进入对应插件目录运行 `./install.sh`，即可将该插件同步至 `~/.gemini/config/plugins/<plugin-name>/`（Antigravity 会自动发现并热加载）。
