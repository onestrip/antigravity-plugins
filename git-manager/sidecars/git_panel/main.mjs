/**
 * Antigravity 原生 Git 管理 Sidecar 服务入口。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SidecarApp, Response } from 'sidecar_sdk';
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
} from './git_service.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');

function serveStatic(filename, contentType) {
  return () => {
    const body = readFileSync(join(PUBLIC_DIR, filename), 'utf8');
    return new Response(body, { contentType });
  };
}

function registerRepoApi(app, route, handler, { allowNonGit = false } = {}) {
  app.api(route, async (data) => {
    try {
      const repoPath = await assertAllowedRepo(data.repoPath, data.workspaceUris, { allowNonGit });
      const result = await handler(repoPath, data);
      return {
        ok: true,
        data: result?.data ?? null,
        gitLog: result?.gitLog ?? null,
        logs: result?.logs ?? (result?.gitLog ? [result.gitLog] : []),
      };
    } catch (err) {
      return {
        ok: false,
        error: err?.message || String(err),
      };
    }
  });
}

const app = new SidecarApp();

app.page('/', serveStatic('index.html', 'text/html; charset=utf-8'));
app.page('/styles.css', serveStatic('styles.css', 'text/css; charset=utf-8'));
app.page('/app.js', serveStatic('app.js', 'application/javascript; charset=utf-8'));

// 全部 API 使用 POST，确保强制经过 sidecar_sdk 的 X-Sidecar-Token 校验
app.api('/api/repos', async (data) => {
  try {
    const repos = await discoverRepos(data.workspaceUris);
    return { ok: true, data: { repos } };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

registerRepoApi(app, '/api/init', (repoPath) => initRepo(repoPath), { allowNonGit: true });
registerRepoApi(app, '/api/status', (repoPath) => getStatus(repoPath));
registerRepoApi(app, '/api/diff', (repoPath, data) => getDiff(repoPath, data));
registerRepoApi(app, '/api/stage', (repoPath, data) => stageFiles(repoPath, data.paths));
registerRepoApi(app, '/api/stage-all', (repoPath) => stageAll(repoPath));
registerRepoApi(app, '/api/unstage', (repoPath, data) => unstageFiles(repoPath, data.paths));
registerRepoApi(app, '/api/unstage-all', (repoPath) => unstageAll(repoPath));
registerRepoApi(app, '/api/discard', (repoPath, data) => discardFile(repoPath, data));
registerRepoApi(app, '/api/commit', (repoPath, data) => commit(repoPath, data));
registerRepoApi(app, '/api/fetch', (repoPath, data) => fetch(repoPath, data));
registerRepoApi(app, '/api/pull', (repoPath, data) => pull(repoPath, data));
registerRepoApi(app, '/api/push', (repoPath, data) => push(repoPath, data));
registerRepoApi(app, '/api/sync', (repoPath, data) => sync(repoPath, data));
registerRepoApi(app, '/api/branches', (repoPath) => getBranches(repoPath));
registerRepoApi(app, '/api/checkout', (repoPath, data) => checkout(repoPath, data));
registerRepoApi(app, '/api/branch/create', (repoPath, data) => createBranch(repoPath, data));
registerRepoApi(app, '/api/branch/delete', (repoPath, data) => deleteBranch(repoPath, data));
registerRepoApi(app, '/api/branch/merge', (repoPath, data) => mergeBranch(repoPath, data));
registerRepoApi(app, '/api/stashes', (repoPath) => listStashes(repoPath));
registerRepoApi(app, '/api/stash/save', (repoPath, data) => saveStash(repoPath, data));
registerRepoApi(app, '/api/stash/apply', (repoPath, data) => applyStash(repoPath, data));
registerRepoApi(app, '/api/stash/pop', (repoPath, data) => popStash(repoPath, data));
registerRepoApi(app, '/api/stash/drop', (repoPath, data) => dropStash(repoPath, data));
registerRepoApi(app, '/api/log', (repoPath, data) => getLog(repoPath, data));
registerRepoApi(app, '/api/commit-detail', (repoPath, data) => getCommitDetail(repoPath, data));
registerRepoApi(app, '/api/reset-soft', (repoPath) => resetSoftLast(repoPath));
registerRepoApi(app, '/api/revert', (repoPath, data) => revertCommit(repoPath, data));

await app.run();
