import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  applyStash,
  assertAllowedRepo,
  checkout,
  commit,
  createBranch,
  deleteBranch,
  discardFile,
  discoverRepos,
  dropStash,
  fetch,
  getBranches,
  getCommitDetail,
  getDiff,
  getLog,
  getStatus,
  initRepo,
  listStashes,
  mergeBranch,
  popStash,
  pull,
  push,
  resetSoftLast,
  revertCommit,
  saveStash,
  stageAll,
  stageFiles,
  sync,
  unstageAll,
  unstageFiles,
} from '../sidecars/git_panel/git_service.mjs';

function gitRaw(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

describe('git_service end-to-end tests', () => {
  let sandboxDir;
  let bareDir;
  let localRepo;
  let peerRepo;
  let uninitDir;
  let outsideDir;
  let workspaceUris;

  before(() => {
    sandboxDir = mkdtempSync(join(tmpdir(), 'agy-git-manager-test-'));
    bareDir = join(sandboxDir, 'remote.git');
    localRepo = join(sandboxDir, 'local-repo');
    peerRepo = join(sandboxDir, 'peer-repo');
    uninitDir = join(sandboxDir, 'uninit-dir');
    outsideDir = join(sandboxDir, 'outside-dir');

    mkdirSync(bareDir, { recursive: true });
    mkdirSync(localRepo, { recursive: true });
    mkdirSync(peerRepo, { recursive: true });
    mkdirSync(uninitDir, { recursive: true });
    mkdirSync(outsideDir, { recursive: true });

    gitRaw(bareDir, ['init', '--bare', '-b', 'main']);
    gitRaw(localRepo, ['init', '-b', 'main']);
    gitRaw(localRepo, ['config', 'user.name', 'Test User']);
    gitRaw(localRepo, ['config', 'user.email', 'test@example.com']);
    gitRaw(localRepo, ['remote', 'add', 'origin', bareDir]);

    workspaceUris = [
      pathToFileURL(localRepo).href,
      pathToFileURL(uninitDir).href,
    ];
  });

  after(() => {
    if (sandboxDir && existsSync(sandboxDir)) {
      rmSync(sandboxDir, { recursive: true, force: true });
    }
  });

  it('discovers repos and enforces workspace boundary checks', async () => {
    const repos = await discoverRepos(workspaceUris);
    assert.equal(repos.length, 1);
    assert.equal(repos[0].isGitRepo, true);

    const allowed = await assertAllowedRepo(localRepo, workspaceUris);
    assert.ok(allowed.endsWith('local-repo'));

    await assert.rejects(
      () => assertAllowedRepo(outsideDir, workspaceUris),
      /不在当前工作区允许的仓库范围内/,
    );

    const onlyUninit = await discoverRepos([pathToFileURL(uninitDir).href]);
    assert.equal(onlyUninit.length, 1);
    assert.equal(onlyUninit[0].isGitRepo, false);
  });

  it('initializes a plain directory via initRepo', async () => {
    const res = await initRepo(uninitDir);
    assert.equal(res.data.initialized, true);
    const st = await getStatus(uninitDir);
    assert.equal(st.data.hasCommits, false);
  });

  it('handles staging, unstaging before first commit, Chinese paths, diff, and discard', async () => {
    writeFileSync(join(localRepo, 'README.md'), '# Git Manager\nline1\n', 'utf8');
    writeFileSync(join(localRepo, '测试文档.md'), '你好 Antigravity\n', 'utf8');
    writeFileSync(join(localRepo, 'temp-untracked.txt'), 'scratch\n', 'utf8');

    let st = (await getStatus(localRepo)).data;
    assert.equal(st.hasCommits, false);
    assert.equal(st.untracked.length, 3);

    // 未跟踪 Diff 预览
    const untrackedDiff = (await getDiff(localRepo, { file: '测试文档.md', untracked: true })).data;
    assert.match(untrackedDiff.diff, /\+你好 Antigravity/);

    // 首次提交前 stage + unstage
    await stageFiles(localRepo, ['README.md', '测试文档.md']);
    st = (await getStatus(localRepo)).data;
    assert.equal(st.staged.length, 2);

    await unstageFiles(localRepo, ['测试文档.md']);
    st = (await getStatus(localRepo)).data;
    assert.equal(st.staged.length, 1);
    assert.ok(st.untracked.some((f) => f.path === '测试文档.md'));

    // 丢弃未跟踪文件
    await discardFile(localRepo, { path: 'temp-untracked.txt', untracked: true });
    assert.equal(existsSync(join(localRepo, 'temp-untracked.txt')), false);

    // 全部暂存并完成首次提交
    await stageAll(localRepo);
    await commit(localRepo, { message: 'feat: initial commit' });
    st = (await getStatus(localRepo)).data;
    assert.equal(st.hasCommits, true);
    assert.equal(st.totalChanges, 0);

    // 修改已跟踪文件后查看 diff 并丢弃
    writeFileSync(join(localRepo, 'README.md'), '# Git Manager\nmodified\n', 'utf8');
    const modDiff = (await getDiff(localRepo, { file: 'README.md', staged: false })).data;
    assert.match(modDiff.diff, /\+modified/);

    await discardFile(localRepo, { path: 'README.md', untracked: false });
    assert.equal(readFileSync(join(localRepo, 'README.md'), 'utf8'), '# Git Manager\nline1\n');

    // 验证 amend 与 unstageAll
    writeFileSync(join(localRepo, 'README.md'), '# Git Manager\nv2\n', 'utf8');
    await stageAll(localRepo);
    await unstageAll(localRepo);
    st = (await getStatus(localRepo)).data;
    assert.equal(st.staged.length, 0);
    assert.equal(st.unstaged.length, 1);

    await commit(localRepo, { message: 'feat: initial commit amended', stageAll: true, amend: true });
    const log = (await getLog(localRepo, { limit: 10 })).data.commits;
    assert.equal(log.length, 1);
    assert.equal(log[0].subject, 'feat: initial commit amended');
  });

  it('pushes, fetches, pulls, and syncs with remote repository', async () => {
    // 首次推送自动 -u origin main
    await push(localRepo, { setUpstream: true });
    let st = (await getStatus(localRepo)).data;
    assert.equal(st.upstream, 'origin/main');
    assert.equal(st.ahead, 0);

    // 在 peerRepo 克隆并推送一个新提交模拟远端更新
    gitRaw(sandboxDir, ['clone', bareDir, 'peer-clone']);
    const peerClone = join(sandboxDir, 'peer-clone');
    gitRaw(peerClone, ['config', 'user.name', 'Peer']);
    gitRaw(peerClone, ['config', 'user.email', 'peer@example.com']);
    writeFileSync(join(peerClone, 'remote.txt'), 'from remote\n', 'utf8');
    gitRaw(peerClone, ['add', '-A']);
    gitRaw(peerClone, ['commit', '-m', 'chore: remote change']);
    gitRaw(peerClone, ['push']);

    await fetch(localRepo, { prune: true });
    st = (await getStatus(localRepo)).data;
    assert.equal(st.behind, 1);

    await pull(localRepo, { rebase: true });
    st = (await getStatus(localRepo)).data;
    assert.equal(st.behind, 0);
    assert.equal(existsSync(join(localRepo, 'remote.txt')), true);

    // 本地再提交一次并测试一键 sync
    writeFileSync(join(localRepo, 'local-sync.txt'), 'sync\n', 'utf8');
    await commit(localRepo, { message: 'feat: sync test', stageAll: true });
    const syncRes = await sync(localRepo, { rebase: true });
    assert.equal(syncRes.data.synced, true);
    st = (await getStatus(localRepo)).data;
    assert.equal(st.ahead, 0);
    assert.equal(st.behind, 0);
  });

  it('manages branches and rejects unsafe refs/paths', async () => {
    await createBranch(localRepo, { name: 'feat/demo', checkout: true });
    writeFileSync(join(localRepo, 'feat.txt'), 'feature work\n', 'utf8');
    await commit(localRepo, { message: 'feat: feature work', stageAll: true });

    await checkout(localRepo, { target: 'main' });
    await mergeBranch(localRepo, { name: 'feat/demo' });
    assert.equal(existsSync(join(localRepo, 'feat.txt')), true);

    await deleteBranch(localRepo, { name: 'feat/demo' });
    const br = (await getBranches(localRepo)).data;
    assert.equal(br.local.some((b) => b.name === 'feat/demo'), false);

    // 注入拦截校验
    await assert.rejects(() => createBranch(localRepo, { name: '-f' }), /格式非法/);
    await assert.rejects(() => getDiff(localRepo, { file: '../secret.txt' }), /越出仓库根目录/);
  });

  it('supports stash save, list, apply, pop, drop and history reset/revert', async () => {
    writeFileSync(join(localRepo, 'wip.txt'), 'work in progress\n', 'utf8');
    await saveStash(localRepo, { message: 'wip backup', includeUntracked: true });
    let stashes = (await listStashes(localRepo)).data.stashes;
    assert.equal(stashes.length, 1);
    assert.equal(existsSync(join(localRepo, 'wip.txt')), false);

    await applyStash(localRepo, { ref: 'stash@{0}' });
    assert.equal(existsSync(join(localRepo, 'wip.txt')), true);
    await discardFile(localRepo, { path: 'wip.txt', untracked: true });

    await popStash(localRepo, { ref: 'stash@{0}' });
    assert.equal(existsSync(join(localRepo, 'wip.txt')), true);
    stashes = (await listStashes(localRepo)).data.stashes;
    assert.equal(stashes.length, 0);

    // dropStash 测试
    await saveStash(localRepo, { message: 'to drop', includeUntracked: true });
    await dropStash(localRepo, { ref: 'stash@{0}' });
    stashes = (await listStashes(localRepo)).data.stashes;
    assert.equal(stashes.length, 0);

    // log + commit detail + resetSoftLast + revertCommit
    writeFileSync(join(localRepo, 'extra.txt'), 'extra\n', 'utf8');
    await commit(localRepo, { message: 'feat: extra commit', stageAll: true });

    let commits = (await getLog(localRepo, { limit: 10 })).data.commits;
    const headHash = commits[0].hash;
    const detail = (await getCommitDetail(localRepo, { hash: headHash })).data;
    assert.match(detail.detail, /feat: extra commit/);

    await revertCommit(localRepo, { hash: headHash });
    assert.equal(existsSync(join(localRepo, 'extra.txt')), false);

    await resetSoftLast(localRepo);
    const st = (await getStatus(localRepo)).data;
    assert.ok(st.staged.length >= 1);
  });
});
