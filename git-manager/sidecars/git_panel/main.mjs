/**
 * Antigravity 原生 Git 管理 Sidecar 服务入口。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SidecarApp, Response } from 'sidecar_sdk';
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
  listStashes,
  mergeBranch,
  popStash,
  pull,
  push,
  resetSoftLast,
  resolveConflict,
  revertCommit,
  saveStash,
  skipOperation,
  stageAll,
  stageFiles,
  suggestCommitMessage,
  sync,
  unstageAll,
  unstageFiles,
} from './git_service.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');
const SERVER_VERSION = '1.3.0';
const METADATA_CACHE_TTL_MS = 5000;
const metadataWorkspaceCache = new Map(); // conversationId -> { uris, ts }

const DEFAULT_SETTINGS = {
  commitLang: 'zh',
  pullRebase: true,
  autoFetch: true,
  forceWithLease: false,
  defaultStageAll: false,
};

function getSettingsPath() {
  const dataDir = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR;
  if (dataDir && dataDir.trim()) {
    return join(dataDir.trim(), 'settings.json');
  }
  return join(__dirname, '.settings.json');
}

function findAppDataDir() {
  const dataDir = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR;
  if (!dataDir) return null;
  for (let d = dataDir; d !== dirname(d); d = dirname(d)) {
    if (basename(d) === 'sidecar_data') {
      const appData = dirname(d);
      return existsSync(join(appData, 'brain')) ? appData : null;
    }
  }
  return null;
}

function sanitizeSettings(raw = {}, base = DEFAULT_SETTINGS) {
  const next = { ...base };
  if (raw && typeof raw === 'object') {
    if (raw.commitLang === 'zh' || raw.commitLang === 'en') {
      next.commitLang = raw.commitLang;
    }
    if (typeof raw.pullRebase === 'boolean') next.pullRebase = raw.pullRebase;
    if (typeof raw.autoFetch === 'boolean') next.autoFetch = raw.autoFetch;
    if (typeof raw.forceWithLease === 'boolean') next.forceWithLease = raw.forceWithLease;
    if (typeof raw.defaultStageAll === 'boolean') next.defaultStageAll = raw.defaultStageAll;
  }
  return next;
}

function readSettings() {
  const filePath = getSettingsPath();
  try {
    if (!existsSync(filePath)) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return sanitizeSettings(parsed, DEFAULT_SETTINGS);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(patch = {}) {
  const current = readSettings();
  const next = sanitizeSettings(patch, current);
  const filePath = getSettingsPath();
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

function serveStatic(filename, contentType) {
  return () => {
    const body = readFileSync(join(PUBLIC_DIR, filename), 'utf8');
    return new Response(body, { contentType });
  };
}

function extractWorkspaceUrisFromMetadata(metaResult) {
  const metaEvent =
    metaResult?.response?.conversationMetadata ||
    metaResult?.response?.conversation_metadata;
  const meta = metaEvent?.metadata;
  if (!meta) return [];

  const uris = [];
  const rawList = meta.workspaceUris || meta.workspace_uris;
  if (Array.isArray(rawList)) {
    for (const u of rawList) {
      if (typeof u === 'string' && u.trim()) uris.push(u.trim());
    }
  }

  const workspaces = meta.workspaces;
  if (Array.isArray(workspaces)) {
    for (const ws of workspaces) {
      const folderUri =
        ws?.workspaceFolderAbsoluteUri ||
        ws?.workspace_folder_absolute_uri ||
        ws?.gitRootAbsoluteUri ||
        ws?.git_root_absolute_uri;
      if (typeof folderUri === 'string' && folderUri.trim()) {
        uris.push(folderUri.trim());
      }
    }
  }

  return Array.from(new Set(uris));
}

function resolveWorkspaceUris(app, data = {}) {
  if (Array.isArray(data.workspaceUris) && data.workspaceUris.length > 0) {
    return data.workspaceUris;
  }

  const convId =
    (typeof data.conversationId === 'string' && data.conversationId.trim()) ||
    app.config.conversationId ||
    '';
  if (!convId) return [];

  const cached = metadataWorkspaceCache.get(convId);
  if (cached && Date.now() - cached.ts < METADATA_CACHE_TTL_MS) {
    return cached.uris;
  }

  try {
    const metaResult = app.getConversationMetadata(convId);
    const uris = extractWorkspaceUrisFromMetadata(metaResult);
    metadataWorkspaceCache.set(convId, { uris, ts: Date.now() });
    return uris;
  } catch {
    return [];
  }
}

async function callConversationService(method, body) {
  const lsAddr = process.env.ANTIGRAVITY_LS_ADDRESS;
  const csrf = process.env.ANTIGRAVITY_CSRF_TOKEN;
  if (!lsAddr || !csrf) {
    throw new Error('缺少 Language Server 地址或 CSRF 令牌');
  }
  const resp = await globalThis.fetch(
    `http://${lsAddr}/product.v1.ConversationService/${method}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
        'x-antigravity-csrf-token': csrf,
      },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) {
    throw new Error(`ConversationService/${method} HTTP ${resp.status}`);
  }
  return resp.json();
}

function readLastPlannerReply(appDataDir, convId) {
  const transcriptPath = join(appDataDir, 'brain', convId, '.system_generated', 'logs', 'transcript.jsonl');
  if (!existsSync(transcriptPath)) return '';
  const raw = readFileSync(transcriptPath, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const row = JSON.parse(lines[i]);
      if (row?.type === 'PLANNER_RESPONSE' && typeof row.content === 'string' && row.content.trim()) {
        return row.content.trim();
      }
    } catch {
      // 忽略单行解析异常
    }
  }
  return '';
}

function cleanCommitMessageText(text) {
  let cleaned = String(text || '').trim();
  cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith('`') && cleaned.endsWith('`'))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

/**
 * 复用 Antigravity 原生 ConversationService (flash_lite) 生成真实 LLM 提交说明，用完即删临时会话。
 */
async function generateLlmCommitMessage(context, lang = 'zh') {
  const appDataDir = findAppDataDir();
  if (!appDataDir) {
    throw new Error('无法定位 Antigravity 数据目录');
  }

  const langPrompt = lang === 'en'
    ? 'Use concise, idiomatic English for the commit message.'
    : '请务必使用简洁自然的简体中文编写提交说明正文（Conventional Commits 类型前缀保持英文如 feat/fix/docs/refactor/chore）。';

  const fileLines = context.files.map((f) => `- [${f.status}] ${f.path}`).join('\n');
  const recentText = context.recentCommits.length > 0
    ? context.recentCommits.map((s) => `- ${s}`).join('\n')
    : '(none)';

  const prompt = [
    '你是 Git 提交信息生成助手。请严格只根据下方提供的改动摘要与 Diff，生成一条高质量的 Conventional Commits 提交说明。',
    '硬性约束：',
    '1. 不要调用任何工具，也不要读取任何文件，直接输出答案。',
    '2. 第一行格式为 `<type>(<可选scope>): <简明摘要>`（不超过 72 个字符），如有必要可空一行后补 1-3 条简短要点，不要输出解释性废话或 Markdown 代码块围栏。',
    `3. ${langPrompt}`,
    '',
    `当前分支: ${context.branch || 'main'}`,
    '近期提交风格参考:',
    recentText,
    '',
    `本次变更文件 (${context.fileCount}):`,
    fileLines,
    '',
    'Diff Stat:',
    context.diffStat || '(empty)',
    '',
    'Diff 内容片段:',
    context.diffSnippet || '(no diff body)',
  ].join('\n');

  const createPayload = {
    title: '[Git Manager] 生成提交说明',
    model: 'flash_lite',
    tags: ['git-manager-ephemeral'],
    prompt: [{ text: prompt }],
  };
  if (process.env.ANTIGRAVITY_PROJECT_ID) {
    createPayload.projectId = process.env.ANTIGRAVITY_PROJECT_ID;
  }

  const created = await callConversationService('CreateConversation', createPayload);
  const convId = created?.conversation?.id;
  if (!convId) {
    throw new Error('未返回临时会话 ID');
  }

  try {
    const deadline = Date.now() + 25_000;
    let idle = false;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 350));
      const detail = await callConversationService('GetConversation', { conversationId: convId });
      const runState = detail?.state?.runState;
      if (runState === 'RUN_STATE_IDLE') {
        idle = true;
        break;
      }
      if (runState === 'RUN_STATE_CANCELLING') {
        break;
      }
    }

    if (!idle) {
      throw new Error('LLM 生成提交说明超时');
    }

    const reply = cleanCommitMessageText(readLastPlannerReply(appDataDir, convId));
    if (!reply) {
      throw new Error('LLM 未返回有效提交说明');
    }
    return reply;
  } finally {
    try {
      await callConversationService('DeleteConversation', { conversationId: convId });
    } catch {
      // 忽略清理失败
    }
  }
}

function registerRepoApi(app, route, handler, { allowNonGit = false } = {}) {
  app.api(route, async (data) => {
    try {
      const workspaceUris = resolveWorkspaceUris(app, data);
      const repoPath = await assertAllowedRepo(data.repoPath, workspaceUris, { allowNonGit });
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
        gitLog: err?.gitLog ?? null,
        logs: Array.isArray(err?.logs) ? err.logs : (err?.gitLog ? [err.gitLog] : []),
      };
    }
  });
}

const app = new SidecarApp();

app.page('/', serveStatic('index.html', 'text/html; charset=utf-8'));
app.page('/styles.css', serveStatic('styles.css', 'text/css; charset=utf-8'));
app.page('/app.js', serveStatic('app.js', 'application/javascript; charset=utf-8'));
app.page('/message_formatter.mjs', serveStatic('message_formatter.mjs', 'application/javascript; charset=utf-8'));

// 设置持久化接口
app.api('/api/settings/get', async () => {
  return { ok: true, data: { ...readSettings(), serverVersion: SERVER_VERSION } };
});

app.api('/api/settings/save', async (data) => {
  try {
    const updated = writeSettings(data);
    return { ok: true, data: { ...updated, serverVersion: SERVER_VERSION } };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// 全部业务 API 使用 POST，确保强制经过 sidecar_sdk 的 X-Sidecar-Token 校验
app.api('/api/repos', async (data) => {
  try {
    const workspaceUris = resolveWorkspaceUris(app, data);
    const repos = await discoverRepos(workspaceUris);
    return { ok: true, data: { repos, workspaceUris, serverVersion: SERVER_VERSION } };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

registerRepoApi(app, '/api/init', (repoPath) => initRepo(repoPath), { allowNonGit: true });
registerRepoApi(app, '/api/status', (repoPath) => getStatus(repoPath));
registerRepoApi(app, '/api/diff', (repoPath, data) => getDiff(repoPath, data));

registerRepoApi(app, '/api/suggest-message', async (repoPath, data) => {
  const lang = data.lang === 'en' ? 'en' : 'zh';
  const stageAllFlag = Boolean(data.stageAll);
  const context = await getCommitDiffContext(repoPath, { stageAll: stageAllFlag });
  if (context.fileCount === 0) {
    return { data: { message: '', lang, source: 'empty', fileCount: 0 } };
  }
  try {
    const llmMsg = await generateLlmCommitMessage(context, lang);
    return {
      data: {
        message: llmMsg,
        lang,
        source: 'llm',
        fileCount: context.fileCount,
      },
    };
  } catch {
    const fallback = await suggestCommitMessage(repoPath, { stageAll: stageAllFlag, lang });
    return {
      data: {
        ...fallback.data,
        source: 'heuristic',
      },
      gitLog: fallback.gitLog,
    };
  }
});

registerRepoApi(app, '/api/stage', (repoPath, data) => stageFiles(repoPath, data.paths));
registerRepoApi(app, '/api/stage-all', (repoPath) => stageAll(repoPath));
registerRepoApi(app, '/api/unstage', (repoPath, data) => unstageFiles(repoPath, data.paths));
registerRepoApi(app, '/api/unstage-all', (repoPath) => unstageAll(repoPath));
registerRepoApi(app, '/api/discard', (repoPath, data) => discardFile(repoPath, data));
registerRepoApi(app, '/api/discard-all', (repoPath) => discardAllUnstaged(repoPath));
registerRepoApi(app, '/api/commit', (repoPath, data) => commit(repoPath, data));
registerRepoApi(app, '/api/fetch', (repoPath, data) => fetch(repoPath, data));
registerRepoApi(app, '/api/pull', (repoPath, data) => pull(repoPath, data));
registerRepoApi(app, '/api/push', (repoPath, data) => push(repoPath, data));
registerRepoApi(app, '/api/sync', (repoPath, data) => sync(repoPath, data));
registerRepoApi(app, '/api/operation/continue', (repoPath) => continueOperation(repoPath));
registerRepoApi(app, '/api/operation/skip', (repoPath) => skipOperation(repoPath));
registerRepoApi(app, '/api/operation/abort', (repoPath) => abortOperation(repoPath));
registerRepoApi(app, '/api/conflict/resolve', (repoPath, data) => resolveConflict(repoPath, data));
registerRepoApi(app, '/api/branches', (repoPath) => getBranches(repoPath));
registerRepoApi(app, '/api/checkout', (repoPath, data) => checkout(repoPath, data));
registerRepoApi(app, '/api/branch/create', (repoPath, data) => createBranch(repoPath, data));
registerRepoApi(app, '/api/branch/delete', (repoPath, data) => deleteBranch(repoPath, data));
registerRepoApi(app, '/api/branch/merge', (repoPath, data) => mergeBranch(repoPath, data));
registerRepoApi(app, '/api/stashes', (repoPath) => listStashes(repoPath));
registerRepoApi(app, '/api/stash/detail', (repoPath, data) => getStashDetail(repoPath, data));
registerRepoApi(app, '/api/stash/save', (repoPath, data) => saveStash(repoPath, data));
registerRepoApi(app, '/api/stash/apply', (repoPath, data) => applyStash(repoPath, data));
registerRepoApi(app, '/api/stash/pop', (repoPath, data) => popStash(repoPath, data));
registerRepoApi(app, '/api/stash/drop', (repoPath, data) => dropStash(repoPath, data));
registerRepoApi(app, '/api/log', (repoPath, data) => getLog(repoPath, data));
registerRepoApi(app, '/api/commit-detail', (repoPath, data) => getCommitDetail(repoPath, data));
registerRepoApi(app, '/api/reset-soft', (repoPath) => resetSoftLast(repoPath));
registerRepoApi(app, '/api/revert', (repoPath, data) => revertCommit(repoPath, data));

await app.run();
