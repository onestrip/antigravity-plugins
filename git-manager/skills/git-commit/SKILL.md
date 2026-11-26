---
name: git-commit
description: >-
  Inspect working tree changes, filter out sensitive files, generate a clear
  Conventional Commits message, stage files, and create a Git commit (optionally
  pushing afterward). Use when the user wants to commit changes, generate a
  commit message, or invokes /git-commit.
---

# Git 智能提交（`/git-commit`）

按照以下步骤完成类 Codex 的智能提交流程：

1. **检查仓库状态与差异**：
   - 运行 `git -c core.quotepath=false status --short --branch` 与 `git diff --stat`。
   - 如果已有暂存（staged）改动，优先查看 `git -c core.quotepath=false diff --staged`；若无暂存改动，则查看工作区 `git -c core.quotepath=false diff` 及未跟踪文件列表。
2. **敏感文件检查**：
   - 检查变更清单中是否包含 `.env`、密钥、token 或大体积临时文件。如有，明确提醒用户并默认跳过暂存这些文件。
3. **生成提交信息**：
   - 若仓库历史有约定语言或格式（通过 `git log -n 5 --oneline` 参考），保持一致；否则默认使用简洁清晰的 Conventional Commits（如 `feat: ...`、`fix: ...`、`docs: ...`、`refactor: ...`、`chore: ...`）。
   - 向用户简要列出拟提交的文件与生成的提交信息。如果改动范围大或用户仅要求“看一眼”，先确认再提交；如果用户明确要求直接提交，则继续执行。
4. **执行暂存与提交**：
   - 若用户需要暂存全部安全改动，执行 `git add ...`；然后使用 `git commit -m "<message>"` 完成提交。
5. **收尾汇报与推送提示**：
   - 输出提交哈希、分支名与变更统计，并在分支领先远端或未设置上游时询问是否需要立即推送（`git push`）。
