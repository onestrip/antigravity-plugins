---
name: git-sync
description: >-
  Safely fetch, pull (rebase or merge), resolve ahead/behind divergence, and
  push the current Git branch while protecting uncommitted work. Use when the
  user asks to sync, pull, push, update from remote, or invokes /git-sync.
---

# Git 安全同步（`/git-sync`）

按照以下步骤安全完成拉取、同步与推送：

1. **诊断当前状态**：
   - 运行 `git -c core.quotepath=false status --short --branch` 与 `git remote -v`。
   - 若无远端仓库，明确提示用户当前仅本地仓库并说明如何添加 `origin`。
2. **拉取远端元信息**：
   - 运行 `git fetch --all --prune`，再次查看本地与上游分支的 ahead/behind 关系。
3. **保护未提交修改**：
   - 若存在未提交修改且需要 `pull --rebase`，先询问或视安全情况用 `git stash push -u -m "auto-sync-backup"` 暂存，同步完成后再 `git stash pop`。
4. **执行拉取与推送**：
   - 若 `behind > 0`：优先执行 `git pull --rebase`（若用户偏好 merge 则用 `git pull`）。如发生冲突，立即停止并列出所有 `UU` / 冲突文件，逐一读取冲突标记并协助用户解决后继续 `git rebase --continue`（或 `git commit`）。
   - 若 `ahead > 0` 或尚未设置上游分支：执行 `git push`（无上游时使用 `git push -u <remote> <branch>`）。
5. **结果汇报**：
   - 总结同步后的分支指向、最新提交与是否仍有未提交改动。
