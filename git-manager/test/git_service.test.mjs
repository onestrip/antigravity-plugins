import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  abortOperation,
  applyStash,
  assertAllowedRepo,
  checkout,
  commit,
  continueOperation,
  createBranch,
  deleteBranch,
  discardAllUnstaged,
  discardFile,
  discoverRepos,
  dropStash,
  fetch,
  getBranches,
  getCommitDetail,
  getCommitDiffContext,
  getDiff,
  getLog,
  getStashDetail,
  getStatus,
  initRepo,
  isSensitivePath,
  listStashes,
  mergeBranch,
  popStash,
  pull,
  push,
  resetSoftLast,
  resolveConflict,
  revertCommit,
  saveStash,
  stageAll,
  stageFiles,
  suggestCommitMessage,
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

  it('suggests commit messages in Chinese (default) and English', async () => {
    writeFileSync(join(localRepo, 'guide.md'), '# Guide\n', 'utf8');
    await stageFiles(localRepo, ['guide.md']);

    const zhRes = (await suggestCommitMessage(localRepo, { stageAll: false, lang: 'zh' })).data;
    assert.match(zhRes.message, /[\u4e00-\u9fa5]/);
    assert.ok(zhRes.fileCount >= 1);

    const enRes = (await suggestCommitMessage(localRepo, { stageAll: false, lang: 'en' })).data;
    assert.match(enRes.message, /^[a-z]+(\([^)]+\))?: /);

    // 清理后应返回空消息
    await unstageAll(localRepo);
    await discardFile(localRepo, { path: 'guide.md', untracked: true });
    // 先把之前 resetSoftLast 留下的 staged 提交掉再测试空工作区
    await commit(localRepo, { message: 'chore: cleanup staged', stageAll: true });
    const emptyRes = (await suggestCommitMessage(localRepo, { stageAll: true, lang: 'zh' })).data;
    assert.equal(emptyRes.message, '');
    assert.equal(emptyRes.fileCount, 0);
  });

  it('detects sensitive files, computes numstat, sanitizes diff context, and supports discardAllUnstaged & stash preview', async () => {
    assert.equal(isSensitivePath('.env'), true);
    assert.equal(isSensitivePath('.env.production'), true);
    assert.equal(isSensitivePath('certs/server.key'), true);
    assert.equal(isSensitivePath('.env.example'), false);

    const prevReadme = readFileSync(join(localRepo, 'README.md'), 'utf8');
    writeFileSync(join(localRepo, '.env'), 'API_SECRET=super-secret-value\n', 'utf8');
    writeFileSync(join(localRepo, 'README.md'), `${prevReadme}added-line\n`, 'utf8');
    writeFileSync(join(localRepo, 'scratch.txt'), 'temp data\n', 'utf8');

    const st = (await getStatus(localRepo)).data;
    const envItem = st.untracked.find((f) => f.path === '.env');
    assert.equal(envItem.sensitive, true);
    assert.equal(envItem.sensitiveReason, 'sensitive');

    const readmeItem = st.unstaged.find((f) => f.path === 'README.md');
    assert.equal(readmeItem.additions, 1);
    assert.equal(readmeItem.deletions, 0);

    // 验证 getCommitDiffContext 自动脱敏 .env 正文
    const ctx = await getCommitDiffContext(localRepo, { stageAll: true });
    assert.equal(ctx.fileCount, 3);
    assert.equal(ctx.diffSnippet.includes('super-secret-value'), false);
    assert.match(ctx.diffSnippet, /已自动脱敏跳过/);

    // 保存 stash 并预览详情
    await saveStash(localRepo, { message: 'preview-stash', includeUntracked: true });
    const stashDetail = (await getStashDetail(localRepo, { ref: 'stash@{0}' })).data;
    assert.match(stashDetail.detail, /added-line/);
    await popStash(localRepo, { ref: 'stash@{0}' });

    // 批量丢弃全部未暂存/未跟踪文件
    const disc = (await discardAllUnstaged(localRepo)).data;
    assert.ok(disc.discardedCount >= 3);
    assert.equal(existsSync(join(localRepo, '.env')), false);
    assert.equal(existsSync(join(localRepo, 'scratch.txt')), false);
  });

  it('supports log search/pagination, conflict resolution, operation abort/continue, and force branch delete', async () => {
    // 日志搜索与分页
    const searchRes = (await getLog(localRepo, { limit: 10, skip: 0, query: 'amended' })).data;
    assert.equal(searchRes.commits.length, 1);
    const page1 = (await getLog(localRepo, { limit: 2, skip: 0 })).data;
    assert.equal(page1.commits.length, 2);
    assert.equal(page1.hasMore, true);

    // 构造真实合并冲突
    writeFileSync(join(localRepo, 'conflict.txt'), 'base\n', 'utf8');
    await commit(localRepo, { message: 'chore: base conflict file', stageAll: true });

    await createBranch(localRepo, { name: 'feat/conflict-branch', checkout: true });
    writeFileSync(join(localRepo, 'conflict.txt'), 'from-feature\n', 'utf8');
    await commit(localRepo, { message: 'feat: feature side', stageAll: true });

    await checkout(localRepo, { target: 'main' });
    writeFileSync(join(localRepo, 'conflict.txt'), 'from-main\n', 'utf8');
    await commit(localRepo, { message: 'feat: main side', stageAll: true });

    // 尝试合并应触发冲突，随后验证 abortOperation
    await assert.rejects(() => mergeBranch(localRepo, { name: 'feat/conflict-branch' }));
    let st = (await getStatus(localRepo)).data;
    assert.equal(st.operationState, 'merging');
    assert.equal(st.conflicted.length, 1);

    await abortOperation(localRepo);
    st = (await getStatus(localRepo)).data;
    assert.equal(st.operationState, null);
    assert.equal(st.conflicted.length, 0);

    // 再次合并并用 resolveConflict('ours') + continueOperation 完成
    await assert.rejects(() => mergeBranch(localRepo, { name: 'feat/conflict-branch' }));
    await resolveConflict(localRepo, { path: 'conflict.txt', strategy: 'ours' });
    await continueOperation(localRepo);
    st = (await getStatus(localRepo)).data;
    assert.equal(st.operationState, null);
    assert.equal(readFileSync(join(localRepo, 'conflict.txt'), 'utf8'), 'from-main\n');

    // 新建一个未合并分支验证 force: false 被拒、force: true 成功删除
    await createBranch(localRepo, { name: 'feat/unmerged-drop', checkout: true });
    writeFileSync(join(localRepo, 'unmerged.txt'), 'wip\n', 'utf8');
    await commit(localRepo, { message: 'wip: unmerged commit', stageAll: true });
    await checkout(localRepo, { target: 'main' });

    await assert.rejects(() => deleteBranch(localRepo, { name: 'feat/unmerged-drop', force: false }));
    await deleteBranch(localRepo, { name: 'feat/unmerged-drop', force: true });
    const branches = (await getBranches(localRepo)).data.local;
    assert.equal(branches.some((b) => b.name === 'feat/unmerged-drop'), false);
  });
});
