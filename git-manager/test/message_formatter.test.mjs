import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { commit, deleteBranch } from '../sidecars/git_panel/git_service.mjs';
import {
  formatErrorMessage,
  formatLogEntry,
  getActionLabel,
  normalizeLang,
} from '../sidecars/git_panel/public/message_formatter.mjs';

describe('message_formatter unit tests', () => {
  it('normalizes language with zh as default', () => {
    assert.equal(normalizeLang('zh'), 'zh');
    assert.equal(normalizeLang('en'), 'en');
    assert.equal(normalizeLang(''), 'zh');
    assert.equal(normalizeLang(undefined), 'zh');
  });

  it('maps routes and git commands to localized action labels', () => {
    assert.equal(getActionLabel('/api/push', 'zh'), 'Push 推送');
    assert.equal(getActionLabel('/api/push', 'en'), 'Push');
    assert.equal(getActionLabel('git pull --rebase', 'zh'), 'Pull 拉取');
    assert.equal(getActionLabel('git branch -D feat/a', 'zh'), '删除 Branch');
    assert.equal(getActionLabel('git switch -c feat/b', 'zh'), '创建 Branch');
    assert.equal(getActionLabel('git reset --soft HEAD~1', 'zh'), 'Soft Reset 撤销 Commit');
    assert.equal(getActionLabel('git stash pop stash@{0}', 'zh'), '弹出 Stash');
  });

  it('formats common Git errors in Chinese while preserving English technical terms', () => {
    const cases = [
      [
        '! [rejected] main -> main (non-fast-forward)\nerror: failed to push some refs\nhint: Updates were rejected because the tip of your current branch is behind',
        /Push 被拒绝（non-fast-forward）：Remote 存在更新的 Commit，请先 Pull 或 Sync 后再 Push/,
      ],
      [
        '! [rejected] main -> main (stale info)',
        /Push 被拒绝（stale info）：Remote Branch 已被更新.*--force-with-lease/,
      ],
      [
        'remote: error: GH006: Protected branch update failed for refs/heads/main.\n! [remote rejected] main -> main (pre-receive hook declined)',
        /Push 被 Remote Hook 或保护 Branch 规则拦截/,
      ],
      [
        'fatal: The current branch feat/x has no upstream branch.',
        /当前 Branch 尚未设置 Upstream，请先关联 Remote Branch/,
      ],
      [
        'Auto-merging src/app.js\nCONFLICT (content): Merge conflict in src/app.js\nAutomatic merge failed; fix conflicts and then commit the result.',
        /检测到 Merge \/ Rebase Conflict（涉及: src\/app\.js）/,
      ],
      [
        'error: Your local changes to the following files would be overwritten by checkout:\n\tpackage.json\n\tsrc/main.mjs\nPlease commit your changes or stash them before you switch branches.',
        /本地未提交改动会被覆盖（涉及: package\.json, src\/main\.mjs），请先 Commit 或 Stash 后再操作/,
      ],
      [
        'error: The following untracked working tree files would be overwritten by merge:\n\tnotes.txt\nPlease move or remove them before you merge.',
        /工作区存在 untracked 文件会被覆盖（涉及: notes\.txt）/,
      ],
      [
        'error: cannot pull with rebase: You have unstaged changes.',
        /存在未暂存或未提交改动，无法执行 Pull --rebase/,
      ],
      [
        'fatal: Need to specify how to reconcile divergent branches.',
        /本地与 Remote Branch 已分叉（divergent）/,
      ],
      [
        'fatal: refusing to merge unrelated histories',
        /拒绝合并无共同提交历史的 Branch（unrelated histories）/,
      ],
      [
        "error: The branch 'feat/demo' is not fully merged.",
        /Branch "feat\/demo" 尚未完全 Merge，普通删除被拒绝/,
      ],
      [
        "fatal: a branch named 'feat/demo' already exists",
        /Branch "feat\/demo" 已存在/,
      ],
      [
        'On branch main\nnothing to commit, working tree clean',
        /工作区干净，没有可 Commit 的改动/,
      ],
      [
        'Author identity unknown\n*** Please tell me who you are.',
        /尚未配置 Git 用户身份（user\.name \/ user\.email）/,
      ],
      [
        "fatal: Unable to create '/repo/.git/index.lock': File exists.",
        /检测到 Git Index 锁文件（\.git\/index\.lock）/,
      ],
      [
        "error: cannot lock ref 'refs/heads/main': is at abc but expected def",
        /无法锁定 Git Ref/,
      ],
      [
        'fatal: Authentication failed for https://github.com/org/repo.git',
        /Remote 认证或权限校验失败/,
      ],
      [
        'fatal: repository \'https://github.com/org/missing.git\' not found',
        /无法访问 Remote 仓库/,
      ],
      [
        'fatal: unable to access \'https://github.com/org/repo.git/\': Could not resolve host: github.com',
        /无法连接 Remote 仓库（网络异常或连接超时）/,
      ],
      [
        "fatal: bad revision 'nope-123'",
        /找不到指定的 Branch、Commit 或路径引用/,
      ],
      [
        'No local changes to save',
        /工作区没有可保存到 Stash 的本地改动/,
      ],
      [
        'No stash entries found.',
        /当前没有可用的 Stash 记录/,
      ],
      [
        'husky - pre-commit hook exited with code 1 (error)',
        /Git Hook 检查未通过，操作已被拦截/,
      ],
      [
        'fatal: not a git repository (or any of the parent directories): .git',
        /当前目录不是有效的 Git 仓库/,
      ],
      [
        'You are not currently on a branch.',
        /当前处于 Detached HEAD 状态/,
      ],
      [
        'Command failed: git fetch timed out',
        /Git 命令执行超时/,
      ],
      [
        'HTTP 502',
        /Sidecar 服务通信失败/,
      ],
    ];

    for (const [raw, expectedPattern] of cases) {
      const res = formatErrorMessage(raw, { lang: 'zh' });
      assert.match(res.summary, expectedPattern, `Failed on raw: ${raw}`);
      assert.ok(res.detail.includes(res.summary));
    }
  });

  it('formats nested sync stage errors and unknown English errors in zh', () => {
    const nestedPull = formatErrorMessage(
      '同步失败（Pull 阶段）：fatal: Need to specify how to reconcile divergent branches.',
      { lang: 'zh', route: '/api/sync' },
    );
    assert.match(nestedPull.summary, /^Sync 失败（Pull 阶段）：本地与 Remote Branch 已分叉（divergent）/);

    const nestedFetch = formatErrorMessage('同步失败：Fetch 阶段出错', { lang: 'zh', route: '/api/sync' });
    assert.equal(nestedFetch.summary, 'Sync 失败（Fetch 阶段）');

    const unknown = formatErrorMessage('fatal: some exotic git failure', {
      lang: 'zh',
      command: 'git push',
      route: '/api/push',
    });
    assert.equal(unknown.matched, false);
    assert.equal(unknown.summary, 'Push 推送失败：some exotic git failure');
    assert.match(unknown.detail, /原始输出:\nfatal: some exotic git failure/);
  });

  it('formats errors in English mode including Chinese business errors', () => {
    const enGit = formatErrorMessage(
      '! [rejected] main -> main (non-fast-forward)\nhint: Updates were rejected',
      { lang: 'en', command: 'git push' },
    );
    assert.equal(enGit.summary, '! [rejected] main -> main (non-fast-forward)');

    const enFromZh = formatErrorMessage('当前处于游离 HEAD 状态，请先切换到分支后再推送', { lang: 'en' });
    assert.equal(enFromZh.summary, 'Detached HEAD state: please switch to a Branch before Push');

    const enDynamic = formatErrorMessage("分支名称不符合 Git 规范: bad..branch", { lang: 'en' });
    assert.equal(enDynamic.summary, 'Invalid Git Branch name: bad..branch');

    const enNested = formatErrorMessage('同步失败（Push 阶段）：当前分支尚未设置上游跟踪分支', { lang: 'en' });
    assert.equal(enNested.summary, 'Sync failed (Push): Current Branch has no Upstream tracking Branch');
  });

  it('formats activity log entries in zh and en without leaking internal /api routes', () => {
    const zhOk = formatLogEntry(
      {
        time: '09:50:00',
        command: 'git pull --rebase',
        route: '/api/pull',
        ok: true,
        durationMs: 120,
        stdout: 'Already up to date.\n',
        stderr: '',
      },
      'zh',
    );
    assert.equal(zhOk.headText, '[09:50:00] ✓ Pull 拉取 · git pull --rebase (120ms)');
    assert.equal(zhOk.lastSummaryText, '✓ Pull 拉取 (120ms)');
    assert.equal(zhOk.bodyText, '已是最新状态，无需更新');
    assert.equal(zhOk.troubleshootLabel, '交给 Agent 排查');

    const zhOtherSuccess = [
      ['Everything up-to-date', /Remote 已是最新状态/],
      ["Switched to branch 'main'", /已切换到 Branch: main/],
      ['Deleted branch feat/a (was 1234567).', /已删除 Branch: feat\/a \(1234567\)/],
      ['discarded 3 files', /已丢弃 3 个文件的未暂存改动/],
      ['removed untracked temp.txt', /已删除 untracked 文件: temp\.txt/],
      ['Saved working directory and index state WIP on main: 123 msg', /已保存改动到 Stash/],
    ];
    for (const [stdout, expected] of zhOtherSuccess) {
      const res = formatLogEntry(
        { time: '09:50:00', command: 'git status', ok: true, durationMs: 10, stdout, stderr: '' },
        'zh',
      );
      assert.match(res.bodyText, expected);
    }

    const zhRouteOnlyFail = formatLogEntry(
      {
        time: '09:51:00',
        command: '',
        route: '/api/push',
        ok: false,
        durationMs: 0,
        error: '当前处于游离 HEAD 状态，请先切换到分支后再推送',
      },
      'zh',
    );
    assert.equal(zhRouteOnlyFail.headText, '[09:51:00] ✗ Push 推送 (0ms)');
    assert.equal(zhRouteOnlyFail.headText.includes('/api/'), false);
    assert.match(zhRouteOnlyFail.lastSummaryText, /✗ Push 推送 · 当前处于游离 HEAD 状态/);

    const enFail = formatLogEntry(
      {
        time: '09:51:00',
        command: 'git push',
        route: '/api/push',
        ok: false,
        durationMs: 250,
        stderr: '! [rejected] main -> main (non-fast-forward)',
        stdout: '',
      },
      'en',
    );
    assert.equal(enFail.headText, '[09:51:00] ✗ git push (250ms)');
    assert.equal(enFail.troubleshootLabel, 'Ask Agent');
    assert.match(enFail.lastSummaryText, /non-fast-forward/);
  });
});

describe('git_service error metadata attachment', () => {
  let tmpRepo;

  before(() => {
    tmpRepo = mkdtempSync(join(tmpdir(), 'agy-git-err-meta-'));
    execFileSync('git', ['init', '-b', 'main'], { cwd: tmpRepo });
    execFileSync('git', ['config', 'user.name', 'Tester'], { cwd: tmpRepo });
    execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: tmpRepo });
    writeFileSync(join(tmpRepo, 'a.txt'), 'hello\n', 'utf8');
    execFileSync('git', ['add', '-A'], { cwd: tmpRepo });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: tmpRepo });
  });

  after(() => {
    if (tmpRepo && existsSync(tmpRepo)) {
      rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  it('attaches gitLog and logs to thrown errors when runGit fails', async () => {
    let commitErr = null;
    try {
      await commit(tmpRepo, { message: 'chore: empty commit should fail', stageAll: false });
    } catch (err) {
      commitErr = err;
    }
    assert.ok(commitErr);
    assert.ok(commitErr.gitLog);
    assert.equal(commitErr.gitLog.ok, false);
    assert.match(commitErr.gitLog.command, /^git commit/);
    assert.ok(Array.isArray(commitErr.logs));
    assert.equal(commitErr.logs.length, 1);

    let delErr = null;
    try {
      await deleteBranch(tmpRepo, { name: 'non-existent-branch', force: false });
    } catch (err) {
      delErr = err;
    }
    assert.ok(delErr);
    assert.ok(delErr.gitLog);
    assert.equal(delErr.gitLog.ok, false);
    assert.match(delErr.gitLog.command, /^git branch -d/);
  });
});
