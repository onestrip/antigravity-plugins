---
name: git-workflow
description: >-
  Manage Git branches, worktrees, stashes, commit history (soft reset / revert),
  and GitHub pull requests via gh CLI. Use when the user asks to switch/create
  branches, manage stashes, undo commits, create/check PRs, or invokes /git-workflow.
---

# Git 分支、历史与 PR 协作（`/git-workflow`）

覆盖除日常提交/同步外的分支、贮藏、回退与 PR 工作流：

1. **分支与 Worktree 管理**：
   - 查看分支与工作树：`git branch -a -vv`、`git worktree list`。
   - 新建并切换分支：`git switch -c <branch>`（基于指定起点时附带 `<start-point>`）。
   - 合并分支：`git merge --no-edit <branch>`；删除已合并分支使用 `git branch -d <branch>`（强制删除 `-D` 必须先确认）。
2. **Stash 贮藏管理**：
   - 保存现场：`git stash push -u -m "<note>"`；查看列表：`git stash list`；恢复：`git stash apply` / `git stash pop`。
3. **安全的历史撤销**：
   - 仅撤销最近一次提交但保留改动在暂存区：`git reset --soft HEAD~1`（操作前确认当前分支是否已推送）。
   - 公共分支安全撤销历史提交：`git revert --no-edit <hash>`。
4. **GitHub PR 协作（复用本机 `gh` CLI）**：
   - 先检查 `gh auth status` 与当前分支是否已推送远端。
   - 基于最近提交或改动 diff 生成 PR 标题与正文，运行 `gh pr create`（或 `gh pr status` / `gh pr view`）。
5. **可视化面板联动**：
   - 若已启用并运行本插件的侧边面板，可提示用户点击插件面板入口进行可视化 Diff、暂存与历史操作。
