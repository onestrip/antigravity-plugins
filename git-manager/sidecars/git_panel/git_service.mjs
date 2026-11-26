/**
 * 原生 Git 核心服务模块（零第三方依赖，仅使用 Node.js 内置 API 与系统 git/gh CLI）。
 */
import { execFile } from 'node:child_process';
import { existsSync, lstatSync, openSync, readFileSync, readSync, closeSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 10 * 1024 * 1024;
const MAX_DIFF_CHARS = 220 * 1024;
const MAX_UNTRACKED_BYTES = 160 * 1024;
const MAX_SAFE_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

const repoLocks = new Map();
let cachedGhAvailable = null;

function formatArgForLog(arg) {
  const s = String(arg);
  if (/^[a-zA-Z0-9_./:=@+-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

/**
 * 安全执行 git 子进程，不使用 shell 拼接。
 */
export async function runGit(cwd, args, options = {}) {
  const started = Date.now();
  const fullArgs = options.rawArgs ? args : ['-c', 'core.quotepath=false', ...args];
  const displayCommand = `git ${args.map(formatArgForLog).join(' ')}`;

  try {
    const { stdout, stderr } = await execFileAsync('git', fullArgs, {
      cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        LC_ALL: 'C',
        ...(options.env || {}),
      },
      maxBuffer: MAX_BUFFER,
      timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
      encoding: 'utf8',
    });
    return {
      ok: true,
      code: 0,
      stdout: stdout ?? '',
      stderr: stderr ?? '',
      command: displayCommand,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      code: typeof err.code === 'number' ? err.code : 1,
      stdout: typeof err.stdout === 'string' ? err.stdout : '',
      stderr: typeof err.stderr === 'string' ? err.stderr : (err.message || 'git command failed'),
      command: displayCommand,
      durationMs: Date.now() - started,
    };
  }
}

/**
 * 按仓库路径串行化写操作，防止并发触发 .git/index.lock 冲突。
 */
export async function withRepoLock(repoPath, fn) {
  let key = repoPath;
  try {
    key = realpathSync(repoPath);
  } catch {
    key = resolve(repoPath);
  }

  const prev = repoLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((res) => {
    release = res;
  });
  const chained = prev.then(() => current, () => current);
  repoLocks.set(key, chained);

  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (repoLocks.get(key) === chained) {
      repoLocks.delete(key);
    }
  }
}

/**
 * 解码 file:// URI 或规范化本地绝对路径。
 */
export function uriToPath(uriOrPath) {
  if (typeof uriOrPath !== 'string' || !uriOrPath.trim()) return null;
  const trimmed = uriOrPath.trim();
  if (trimmed.startsWith('file://')) {
    try {
      return fileURLToPath(trimmed);
    } catch {
      return null;
    }
  }
  return isAbsolute(trimmed) ? resolve(trimmed) : null;
}

function safeRealpath(targetPath) {
  try {
    return realpathSync(targetPath);
  } catch {
    return resolve(targetPath);
  }
}

function isSubPath(parentPath, childPath) {
  const rel = relative(parentPath, childPath);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function displayRepoName(repoPath) {
  const clean = repoPath.replace(/[\\/]+$/, '');
  const parts = clean.split(sep).filter(Boolean);
  return parts[parts.length - 1] || clean || '/';
}

async function resolveGitTopLevel(dirPath) {
  const res = await runGit(dirPath, ['rev-parse', '--show-toplevel']);
  if (!res.ok) return null;
  const top = res.stdout.trim();
  return top ? safeRealpath(top) : null;
}

/**
 * 基于工作区 URI 列表发现所有关联 Git 仓库；若没有任何 Git 仓库，返回可初始化的工作区目录。
 */
export async function discoverRepos(workspaceUris = []) {
  const rawList = Array.isArray(workspaceUris) ? workspaceUris : [];
  const validWorkspaceDirs = [];
  const seenDirs = new Set();

  for (const item of rawList) {
    const p = uriToPath(item);
    if (!p || !existsSync(p)) continue;
    try {
      if (!statSync(p).isDirectory()) continue;
    } catch {
      continue;
    }
    const rp = safeRealpath(p);
    if (!seenDirs.has(rp)) {
      seenDirs.add(rp);
      validWorkspaceDirs.push(rp);
    }
  }

  const foundMap = new Map(); // realpath -> repo info

  for (const wsDir of validWorkspaceDirs) {
    const top = await resolveGitTopLevel(wsDir);
    if (top) {
      if (!foundMap.has(top)) {
        foundMap.set(top, {
          path: top,
          name: displayRepoName(top),
          isGitRepo: true,
          workspacePath: wsDir,
        });
      }
      continue;
    }

    // 工作区本身不是 Git 仓库，扫描一层直接子目录查找嵌套仓库
    let entries = [];
    try {
      entries = readdirSync(wsDir, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const subDir = join(wsDir, entry.name);
      if (!existsSync(join(subDir, '.git'))) continue;
      const subTop = await resolveGitTopLevel(subDir);
      if (subTop && !foundMap.has(subTop)) {
        foundMap.set(subTop, {
          path: subTop,
          name: displayRepoName(subTop),
          isGitRepo: true,
          workspacePath: wsDir,
        });
      }
    }
  }

  const gitRepos = Array.from(foundMap.values());
  if (gitRepos.length > 0) {
    return gitRepos;
  }

  return validWorkspaceDirs.map((wsDir) => ({
    path: wsDir,
    name: displayRepoName(wsDir),
    isGitRepo: false,
    workspacePath: wsDir,
  }));
}

/**
 * 校验目标路径必须属于当前工作区推导出的合法仓库或可初始化工作区目录，防止路径越权。
 */
export async function assertAllowedRepo(repoPath, workspaceUris, { allowNonGit = false } = {}) {
  if (typeof repoPath !== 'string' || !repoPath.trim()) {
    throw new Error('缺少仓库路径 repoPath');
  }
  const normalized = safeRealpath(repoPath);
  const discovered = await discoverRepos(workspaceUris);
  const matched = discovered.find((item) => safeRealpath(item.path) === normalized);
  if (!matched) {
    throw new Error('目标路径不在当前工作区允许的仓库范围内');
  }
  if (!allowNonGit && !matched.isGitRepo) {
    throw new Error('该目录尚未初始化为 Git 仓库');
  }
  return matched.path;
}

function assertSafeRelPath(repoPath, relPath) {
  if (typeof relPath !== 'string' || !relPath || relPath.includes('\0')) {
    throw new Error('无效的文件路径');
  }
  if (isAbsolute(relPath)) {
    throw new Error('不允许传入绝对文件路径');
  }
  const root = safeRealpath(repoPath);
  const resolved = resolve(root, relPath);
  if (!isSubPath(root, resolved) || resolved === root) {
    throw new Error('文件路径越出仓库根目录');
  }
  return relPath;
}

function assertSafeRefInput(name, label = '引用名称') {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error(`${label}不能为空`);
  }
  const trimmed = name.trim();
  if (
    trimmed.startsWith('-') ||
    /[\x00-\x1f\x7f\s~^:?*[\]\\]/.test(trimmed) ||
    trimmed.includes('..') ||
    trimmed.includes('@{') ||
    trimmed.endsWith('.') ||
    trimmed.endsWith('/') ||
    trimmed.startsWith('/') ||
    trimmed.includes('//')
  ) {
    throw new Error(`${label}格式非法: ${trimmed}`);
  }
  return trimmed;
}

async function assertValidNewBranchName(repoPath, name) {
  const cleaned = assertSafeRefInput(name, '分支名称');
  const check = await runGit(repoPath, ['check-ref-format', '--branch', cleaned]);
  if (!check.ok) {
    throw new Error(`分支名称不符合 Git 规范: ${cleaned}`);
  }
  return cleaned;
}

function assertSafeCommitHash(hash) {
  if (typeof hash !== 'string' || !/^[0-9a-f]{4,40}$/i.test(hash.trim())) {
    throw new Error('无效的提交哈希');
  }
  return hash.trim();
}

function normalizeStashRef(ref) {
  if (typeof ref === 'number' && Number.isInteger(ref) && ref >= 0) {
    return `stash@{${ref}}`;
  }
  if (typeof ref === 'string') {
    const trimmed = ref.trim();
    if (/^\d+$/.test(trimmed)) return `stash@{${trimmed}}`;
    if (/^stash@\{\d+\}$/.test(trimmed)) return trimmed;
  }
  throw new Error('无效的 Stash 引用');
}

async function checkGhAvailable() {
  if (cachedGhAvailable !== null) return cachedGhAvailable;
  try {
    await execFileAsync('gh', ['--version'], { timeout: 3000 });
    cachedGhAvailable = true;
  } catch {
    cachedGhAvailable = false;
  }
  return cachedGhAvailable;
}

function parseChangeLabel(code) {
  switch (code) {
    case 'A': return 'added';
    case 'M': return 'modified';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'C': return 'copied';
    case 'T': return 'typechange';
    case 'U': return 'unmerged';
    default: return 'modified';
  }
}

async function detectRepoOperationState(repoPath) {
  const gitDirRes = await runGit(repoPath, ['rev-parse', '--git-dir']);
  if (!gitDirRes.ok) return null;
  const rawGitDir = gitDirRes.stdout.trim();
  const gitDir = isAbsolute(rawGitDir) ? rawGitDir : resolve(repoPath, rawGitDir);

  if (existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'))) {
    return 'rebasing';
  }
  if (existsSync(join(gitDir, 'MERGE_HEAD'))) {
    return 'merging';
  }
  if (existsSync(join(gitDir, 'CHERRY_PICK_HEAD'))) {
    return 'cherry-picking';
  }
  if (existsSync(join(gitDir, 'REVERT_HEAD'))) {
    return 'reverting';
  }
  return null;
}

async function checkHasCommits(repoPath) {
  const res = await runGit(repoPath, ['rev-parse', '--verify', 'HEAD']);
  return res.ok;
}

async function listRemotes(repoPath) {
  const res = await runGit(repoPath, ['remote', '-v']);
  if (!res.ok) return [];
  const map = new Map();
  for (const line of res.stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(trimmed);
    if (!match) continue;
    const [, name, url, kind] = match;
    if (!map.has(name)) {
      map.set(name, { name, fetchUrl: '', pushUrl: '' });
    }
    const entry = map.get(name);
    if (kind === 'fetch') entry.fetchUrl = url;
    else entry.pushUrl = url;
  }
  return Array.from(map.values());
}

/**
 * 识别疑似敏感文件（私钥、环境变量、凭据等），放行常见示例模板文件。
 */
export function isSensitivePath(relPath) {
  const base = basename(relPath).toLowerCase();
  if (
    base === '.env.example' ||
    base === '.env.sample' ||
    base === '.env.template' ||
    base.endsWith('.example') ||
    base.endsWith('.sample')
  ) {
    return false;
  }
  if (base === '.env' || base.startsWith('.env.')) return true;
  if (/\.(pem|key|p12|pfx|jks|keystore)$/i.test(base)) return true;
  if (/^(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.pub)?$/i.test(base)) return true;
  if (/(credential|secret)s?\.(json|ya?ml|toml|txt|env|ini|conf)$/i.test(base)) return true;
  if (base === '.npmrc' || base === '.pypirc' || base === '.netrc') return true;
  return false;
}

function inspectFileRisk(repoPath, relPath, status) {
  if (isSensitivePath(relPath)) {
    return { sensitive: true, sensitiveReason: 'sensitive' };
  }
  if (status === 'deleted') {
    return { sensitive: false, sensitiveReason: '' };
  }
  try {
    const st = statSync(join(repoPath, relPath));
    if (st.isFile() && st.size > MAX_SAFE_FILE_BYTES) {
      return { sensitive: true, sensitiveReason: 'large' };
    }
  } catch {
    // 忽略 stat 失败
  }
  return { sensitive: false, sensitiveReason: '' };
}

async function getNumstatMap(repoPath, staged = false) {
  const args = staged ? ['diff', '--staged', '--numstat', '-z'] : ['diff', '--numstat', '-z'];
  const res = await runGit(repoPath, args);
  const map = new Map();
  if (!res.ok || !res.stdout) return map;

  const tokens = res.stdout.split('\0');
  for (let i = 0; i < tokens.length; i++) {
    const rec = tokens[i];
    if (!rec) continue;
    const tabParts = rec.split('\t');
    if (tabParts.length < 3) continue;
    const addRaw = tabParts[0];
    const delRaw = tabParts[1];
    let filePath = tabParts.slice(2).join('\t');
    if (filePath === '') {
      // rename 记录在 -z 下为: add\tdel\t\0orig\0new\0
      i++; // orig
      filePath = tokens[++i] || '';
    }
    if (!filePath) continue;
    map.set(filePath, {
      additions: addRaw === '-' ? null : parseInt(addRaw, 10),
      deletions: delRaw === '-' ? null : parseInt(delRaw, 10),
    });
  }
  return map;
}

/**
 * 读取仓库完整状态（porcelain=v2 -z，完美支持中文路径、重命名与冲突）。
 */
export async function getStatus(repoPath) {
  const statusRes = await runGit(repoPath, ['status', '--porcelain=v2', '--branch', '-uall', '-z']);
  if (!statusRes.ok) {
    throw new Error(statusRes.stderr || '获取 Git 状态失败');
  }

  let branch = '';
  let headOid = '';
  let upstream = '';
  let ahead = 0;
  let behind = 0;
  let detached = false;

  const staged = [];
  const unstaged = [];
  const untracked = [];
  const conflicted = [];

  const tokens = statusRes.stdout.split('\0');
  for (let i = 0; i < tokens.length; i++) {
    const rec = tokens[i];
    if (!rec) continue;

    if (rec.startsWith('# ')) {
      if (rec.startsWith('# branch.oid ')) {
        headOid = rec.slice('# branch.oid '.length).trim();
      } else if (rec.startsWith('# branch.head ')) {
        const val = rec.slice('# branch.head '.length).trim();
        if (val === '(detached)') {
          detached = true;
          branch = headOid ? headOid.slice(0, 7) : 'HEAD';
        } else {
          branch = val;
        }
      } else if (rec.startsWith('# branch.upstream ')) {
        upstream = rec.slice('# branch.upstream '.length).trim();
      } else if (rec.startsWith('# branch.ab ')) {
        const m = /\+(\d+)\s+-(\d+)/.exec(rec);
        if (m) {
          ahead = parseInt(m[1], 10);
          behind = parseInt(m[2], 10);
        }
      }
      continue;
    }

    if (rec.startsWith('? ')) {
      const filePath = rec.slice(2);
      const risk = inspectFileRisk(repoPath, filePath, 'untracked');
      untracked.push({ path: filePath, status: 'untracked', code: '?', ...risk });
      continue;
    }

    if (rec.startsWith('u ')) {
      const parts = rec.split(' ');
      const xy = parts[1] || 'UU';
      const filePath = parts.slice(10).join(' ');
      const risk = inspectFileRisk(repoPath, filePath, 'conflicted');
      conflicted.push({ path: filePath, status: 'conflicted', code: xy, ...risk });
      continue;
    }

    if (rec.startsWith('1 ')) {
      const parts = rec.split(' ');
      const xy = parts[1] || '..';
      const filePath = parts.slice(8).join(' ');
      const x = xy[0];
      const y = xy[1];
      if (x && x !== '.') {
        const stLabel = parseChangeLabel(x);
        staged.push({ path: filePath, status: stLabel, code: x, ...inspectFileRisk(repoPath, filePath, stLabel) });
      }
      if (y && y !== '.') {
        const stLabel = parseChangeLabel(y);
        unstaged.push({ path: filePath, status: stLabel, code: y, ...inspectFileRisk(repoPath, filePath, stLabel) });
      }
      continue;
    }

    if (rec.startsWith('2 ')) {
      const parts = rec.split(' ');
      const xy = parts[1] || '..';
      const filePath = parts.slice(9).join(' ');
      const origPath = tokens[++i] || '';
      const x = xy[0];
      const y = xy[1];
      if (x && x !== '.') {
        const stLabel = parseChangeLabel(x);
        staged.push({ path: filePath, origPath, status: stLabel, code: x, ...inspectFileRisk(repoPath, filePath, stLabel) });
      }
      if (y && y !== '.') {
        const stLabel = parseChangeLabel(y);
        unstaged.push({ path: filePath, origPath, status: stLabel, code: y, ...inspectFileRisk(repoPath, filePath, stLabel) });
      }
    }
  }

  const [operationState, remotes, ghAvailable, stagedStat, unstagedStat] = await Promise.all([
    detectRepoOperationState(repoPath),
    listRemotes(repoPath),
    checkGhAvailable(),
    staged.length > 0 ? getNumstatMap(repoPath, true) : Promise.resolve(new Map()),
    unstaged.length > 0 ? getNumstatMap(repoPath, false) : Promise.resolve(new Map()),
  ]);

  for (const item of staged) {
    const stat = stagedStat.get(item.path);
    if (stat) {
      item.additions = stat.additions;
      item.deletions = stat.deletions;
    }
  }
  for (const item of unstaged) {
    const stat = unstagedStat.get(item.path);
    if (stat) {
      item.additions = stat.additions;
      item.deletions = stat.deletions;
    }
  }

  const hasCommits = Boolean(headOid && headOid !== '(initial)');

  return {
    data: {
      repoPath,
      repoName: displayRepoName(repoPath),
      branch,
      headOid: hasCommits ? headOid : '',
      detached,
      upstream,
      ahead,
      behind,
      hasCommits,
      operationState,
      remotes,
      ghAvailable,
      staged,
      unstaged,
      untracked,
      conflicted,
      totalChanges: staged.length + unstaged.length + untracked.length + conflicted.length,
    },
    gitLog: statusRes,
  };
}

function truncateText(text, maxChars = MAX_DIFF_CHARS) {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return {
    text: `${text.slice(0, maxChars)}\n\n... [内容过长，已截断，仅展示前 ${Math.round(maxChars / 1024)} KB]`,
    truncated: true,
  };
}

function buildUntrackedDiff(repoPath, relPath) {
  const root = safeRealpath(repoPath);
  const absPath = resolve(root, relPath);
  if (!isSubPath(root, absPath)) {
    throw new Error('文件路径越出仓库根目录');
  }
  if (!existsSync(absPath)) {
    return { diff: '', isBinary: false, truncated: false, message: '文件不存在' };
  }
  const st = lstatSync(absPath);
  if (st.isSymbolicLink()) {
    return { diff: `--- /dev/null\n+++ b/${relPath}\n@@ -0,0 +1 @@\n+[Symbolic Link]`, isBinary: false, truncated: false };
  }
  if (!st.isFile()) {
    return { diff: '', isBinary: false, truncated: false, message: '非普通文件，无法预览内容' };
  }

  const readLen = Math.min(st.size, MAX_UNTRACKED_BYTES);
  const buf = Buffer.alloc(readLen);
  const fd = openSync(absPath, 'r');
  try {
    readSync(fd, buf, 0, readLen, 0);
  } finally {
    closeSync(fd);
  }

  if (buf.includes(0)) {
    return { diff: '', isBinary: true, truncated: false, message: '二进制文件，无法预览文本差异' };
  }

  const text = buf.toString('utf8');
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  const header = `diff --git a/${relPath} b/${relPath}\nnew file\n--- /dev/null\n+++ b/${relPath}\n@@ -0,0 +1,${Math.max(lines.length, 1)} @@`;
  const body = lines.map((line) => `+${line}`).join('\n');
  const truncated = st.size > MAX_UNTRACKED_BYTES;
  const suffix = truncated ? `\n... [未跟踪文件较大，仅预览前 ${Math.round(MAX_UNTRACKED_BYTES / 1024)} KB]` : '';
  return {
    diff: `${header}\n${body}${suffix}`,
    isBinary: false,
    truncated,
  };
}

/**
 * 获取单文件 Diff（支持 staged / unstaged / untracked）。
 */
export async function getDiff(repoPath, { file, staged = false, untracked = false } = {}) {
  const relPath = assertSafeRelPath(repoPath, file);

  if (untracked) {
    const res = buildUntrackedDiff(repoPath, relPath);
    return { data: { file: relPath, staged: false, untracked: true, ...res } };
  }

  const args = staged
    ? ['diff', '--staged', '--no-color', '--', relPath]
    : ['diff', '--no-color', '--', relPath];

  const diffRes = await runGit(repoPath, args);
  if (!diffRes.ok) {
    throw new Error(diffRes.stderr || '获取 Diff 失败');
  }

  const raw = diffRes.stdout;
  const isBinary = /Binary files .* differ/.test(raw) || /GIT binary patch/.test(raw);
  const { text, truncated } = truncateText(raw);

  return {
    data: {
      file: relPath,
      staged: Boolean(staged),
      untracked: false,
      diff: text,
      isBinary,
      truncated,
    },
    gitLog: diffRes,
  };
}

export async function stageFiles(repoPath, paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('请选择要暂存的文件');
  }
  const safePaths = paths.map((p) => assertSafeRelPath(repoPath, p));
  return withRepoLock(repoPath, async () => {
    const res = await runGit(repoPath, ['add', '--', ...safePaths]);
    if (!res.ok) throw new Error(res.stderr || '暂存文件失败');
    return { data: { staged: safePaths }, gitLog: res };
  });
}

export async function stageAll(repoPath) {
  return withRepoLock(repoPath, async () => {
    const res = await runGit(repoPath, ['add', '-A']);
    if (!res.ok) throw new Error(res.stderr || '全部暂存失败');
    return { data: { stagedAll: true }, gitLog: res };
  });
}

export async function unstageFiles(repoPath, paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('请选择要取消暂存的文件');
  }
  const safePaths = paths.map((p) => assertSafeRelPath(repoPath, p));
  return withRepoLock(repoPath, async () => {
    const hasCommits = await checkHasCommits(repoPath);
    const args = hasCommits
      ? ['reset', '-q', 'HEAD', '--', ...safePaths]
      : ['rm', '--cached', '-r', '-q', '--', ...safePaths];
    const res = await runGit(repoPath, args);
    if (!res.ok) throw new Error(res.stderr || '取消暂存失败');
    return { data: { unstaged: safePaths }, gitLog: res };
  });
}

export async function unstageAll(repoPath) {
  return withRepoLock(repoPath, async () => {
    const hasCommits = await checkHasCommits(repoPath);
    const args = hasCommits ? ['reset', '-q', 'HEAD'] : ['rm', '--cached', '-r', '-q', '--ignore-unmatch', '.'];
    const res = await runGit(repoPath, args);
    if (!res.ok) throw new Error(res.stderr || '全部取消暂存失败');
    return { data: { unstagedAll: true }, gitLog: res };
  });
}

export async function discardFile(repoPath, { path: relPath, untracked = false } = {}) {
  const safePath = assertSafeRelPath(repoPath, relPath);
  return withRepoLock(repoPath, async () => {
    if (untracked) {
      const root = safeRealpath(repoPath);
      const target = resolve(root, safePath);
      if (!isSubPath(root, target) || target === root) {
        throw new Error('路径越界，拒绝删除');
      }
      rmSync(target, { recursive: true, force: true });
      return {
        data: { discarded: safePath, untracked: true },
        gitLog: { ok: true, code: 0, stdout: `removed untracked ${safePath}`, stderr: '', command: `rm ${safePath}`, durationMs: 1 },
      };
    }

    const res = await runGit(repoPath, ['checkout', '--', safePath]);
    if (!res.ok) {
      const restoreRes = await runGit(repoPath, ['restore', '--worktree', '--', safePath]);
      if (!restoreRes.ok) {
        throw new Error(restoreRes.stderr || res.stderr || '丢弃改动失败');
      }
      return { data: { discarded: safePath, untracked: false }, gitLog: restoreRes };
    }
    return { data: { discarded: safePath, untracked: false }, gitLog: res };
  });
}

export async function commit(repoPath, { message = '', stageAll: shouldStageAll = false, amend = false } = {}) {
  const msg = typeof message === 'string' ? message.trim() : '';
  if (!amend && !msg) {
    throw new Error('请填写提交说明（Commit Message）');
  }

  return withRepoLock(repoPath, async () => {
    const logs = [];
    if (shouldStageAll) {
      const addRes = await runGit(repoPath, ['add', '-A']);
      logs.push(addRes);
      if (!addRes.ok) throw new Error(addRes.stderr || '自动暂存全部改动失败');
    }

    const args = ['commit'];
    if (amend) {
      args.push('--amend');
      if (msg) {
        args.push('-m', msg);
      } else {
        args.push('--no-edit');
      }
    } else {
      args.push('-m', msg);
    }

    const commitRes = await runGit(repoPath, args);
    logs.push(commitRes);
    if (!commitRes.ok) {
      const errText = [commitRes.stderr, commitRes.stdout].filter(Boolean).join('\n').trim();
      throw new Error(errText || '提交失败');
    }

    return {
      data: { committed: true, output: commitRes.stdout.trim() },
      gitLog: commitRes,
      logs,
    };
  });
}

export async function fetch(repoPath, { prune = true } = {}) {
  return withRepoLock(repoPath, async () => {
    const args = ['fetch', '--all'];
    if (prune) args.push('--prune');
    const res = await runGit(repoPath, args);
    if (!res.ok) throw new Error(res.stderr || res.stdout || 'Fetch 失败');
    return { data: { fetched: true, output: (res.stderr || res.stdout).trim() }, gitLog: res };
  });
}

export async function pull(repoPath, { rebase = false } = {}) {
  return withRepoLock(repoPath, async () => {
    const args = ['pull'];
    if (rebase) args.push('--rebase');
    const res = await runGit(repoPath, args);
    if (!res.ok) {
      const errText = [res.stderr, res.stdout].filter(Boolean).join('\n').trim();
      throw new Error(errText || '拉取失败');
    }
    return { data: { pulled: true, output: (res.stdout || res.stderr).trim() }, gitLog: res };
  });
}

export async function push(repoPath, { forceWithLease = false, setUpstream = true } = {}) {
  return withRepoLock(repoPath, async () => {
    const status = (await getStatus(repoPath)).data;
    if (status.detached) {
      throw new Error('当前处于游离 HEAD 状态，请先切换到分支后再推送');
    }
    if (!status.hasCommits) {
      throw new Error('当前分支尚无任何提交，请先提交后再推送');
    }

    const args = ['push'];
    if (forceWithLease) {
      args.push('--force-with-lease');
    }

    if (!status.upstream) {
      if (!setUpstream) {
        throw new Error('当前分支尚未设置上游跟踪分支');
      }
      const remote = status.remotes.find((r) => r.name === 'origin')?.name || status.remotes[0]?.name;
      if (!remote) {
        throw new Error('尚未配置远程仓库（remote），无法推送');
      }
      args.push('-u', remote, status.branch);
    }

    const res = await runGit(repoPath, args);
    if (!res.ok) {
      const errText = [res.stderr, res.stdout].filter(Boolean).join('\n').trim();
      throw new Error(errText || '推送失败');
    }
    return { data: { pushed: true, output: (res.stderr || res.stdout).trim() }, gitLog: res };
  });
}

export async function sync(repoPath, { rebase = true } = {}) {
  return withRepoLock(repoPath, async () => {
    const steps = [];
    const logs = [];

    const fetchRes = await runGit(repoPath, ['fetch', '--all', '--prune']);
    logs.push(fetchRes);
    if (!fetchRes.ok) {
      throw new Error(fetchRes.stderr || fetchRes.stdout || '同步失败：Fetch 阶段出错');
    }
    steps.push({ step: 'fetch', ok: true });

    let st = (await getStatus(repoPath)).data;
    if (st.conflicted.length > 0) {
      throw new Error('存在未解决的冲突文件，请先处理冲突后再同步');
    }

    if (st.upstream && st.behind > 0) {
      const pullArgs = rebase ? ['pull', '--rebase'] : ['pull'];
      const pullRes = await runGit(repoPath, pullArgs);
      logs.push(pullRes);
      if (!pullRes.ok) {
        const errText = [pullRes.stderr, pullRes.stdout].filter(Boolean).join('\n').trim();
        throw new Error(`同步失败（Pull 阶段）：${errText}`);
      }
      steps.push({ step: 'pull', ok: true });
      st = (await getStatus(repoPath)).data;
    }

    if (st.hasCommits && !st.detached && (st.ahead > 0 || (!st.upstream && st.remotes.length > 0))) {
      const pushArgs = ['push'];
      if (!st.upstream) {
        const remote = st.remotes.find((r) => r.name === 'origin')?.name || st.remotes[0]?.name;
        if (remote) pushArgs.push('-u', remote, st.branch);
      }
      const pushRes = await runGit(repoPath, pushArgs);
      logs.push(pushRes);
      if (!pushRes.ok) {
        const errText = [pushRes.stderr, pushRes.stdout].filter(Boolean).join('\n').trim();
        throw new Error(`同步失败（Push 阶段）：${errText}`);
      }
      steps.push({ step: 'push', ok: true });
    }

    return {
      data: { synced: true, steps },
      gitLog: logs[logs.length - 1],
      logs,
    };
  });
}

export async function getBranches(repoPath) {
  const localFmt = '%(HEAD)\x1f%(refname:short)\x1f%(upstream:short)\x1f%(upstream:track,nobracket)\x1f%(objectname:short)\x1f%(subject)';
  const remoteFmt = '%(refname:short)\x1f%(objectname:short)\x1f%(subject)';

  const [localRes, remoteRes, wtRes] = await Promise.all([
    runGit(repoPath, ['for-each-ref', `--format=${localFmt}`, 'refs/heads']),
    runGit(repoPath, ['for-each-ref', `--format=${remoteFmt}`, 'refs/remotes']),
    runGit(repoPath, ['worktree', 'list', '--porcelain']),
  ]);

  if (!localRes.ok) throw new Error(localRes.stderr || '获取分支列表失败');

  const local = localRes.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [headMark, name, upstream, track, hash, subject] = line.split('\x1f');
      return {
        current: headMark === '*',
        name,
        upstream: upstream || '',
        track: track || '',
        hash: hash || '',
        subject: subject || '',
      };
    });

  const remote = remoteRes.ok
    ? remoteRes.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [name, hash, subject] = line.split('\x1f');
          return { name, hash: hash || '', subject: subject || '' };
        })
        .filter((r) => !r.name.endsWith('/HEAD'))
    : [];

  const worktrees = [];
  if (wtRes.ok) {
    let cur = null;
    for (const line of wtRes.stdout.split('\n')) {
      if (!line.trim()) {
        if (cur) {
          worktrees.push(cur);
          cur = null;
        }
        continue;
      }
      if (line.startsWith('worktree ')) {
        cur = { path: line.slice('worktree '.length).trim(), branch: '', head: '', detached: false };
      } else if (cur && line.startsWith('HEAD ')) {
        cur.head = line.slice('HEAD '.length).trim();
      } else if (cur && line.startsWith('branch ')) {
        cur.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '').trim();
      } else if (cur && line === 'detached') {
        cur.detached = true;
      }
    }
    if (cur) worktrees.push(cur);
  }

  return {
    data: { local, remote, worktrees },
    gitLog: localRes,
  };
}

export async function checkout(repoPath, { target, isRemote = false } = {}) {
  const safeTarget = assertSafeRefInput(target, '目标分支');
  return withRepoLock(repoPath, async () => {
    const args = isRemote ? ['switch', '--track', safeTarget] : ['switch', safeTarget];
    let res = await runGit(repoPath, args);
    if (!res.ok) {
      // 兼容旧版 Git 或特殊引用回退 checkout
      const fallbackArgs = isRemote ? ['checkout', '--track', safeTarget] : ['checkout', safeTarget];
      res = await runGit(repoPath, fallbackArgs);
    }
    if (!res.ok) {
      throw new Error(res.stderr || res.stdout || `切换分支 ${safeTarget} 失败`);
    }
    return { data: { checkedOut: safeTarget }, gitLog: res };
  });
}

export async function createBranch(repoPath, { name, startPoint = '', checkout: shouldCheckout = true } = {}) {
  const branchName = await assertValidNewBranchName(repoPath, name);
  const start = startPoint ? assertSafeRefInput(startPoint, '起点分支') : '';

  return withRepoLock(repoPath, async () => {
    const args = shouldCheckout ? ['switch', '-c', branchName] : ['branch', branchName];
    if (start) args.push(start);
    const res = await runGit(repoPath, args);
    if (!res.ok) {
      throw new Error(res.stderr || res.stdout || `创建分支 ${branchName} 失败`);
    }
    return { data: { branch: branchName, checkedOut: Boolean(shouldCheckout) }, gitLog: res };
  });
}

export async function deleteBranch(repoPath, { name, force = false } = {}) {
  const branchName = assertSafeRefInput(name, '分支名称');
  return withRepoLock(repoPath, async () => {
    const st = (await getStatus(repoPath)).data;
    if (st.branch === branchName) {
      throw new Error('不能删除当前正在使用的分支，请先切换到其他分支');
    }
    const res = await runGit(repoPath, ['branch', force ? '-D' : '-d', branchName]);
    if (!res.ok) {
      throw new Error(res.stderr || res.stdout || `删除分支 ${branchName} 失败`);
    }
    return { data: { deleted: branchName }, gitLog: res };
  });
}

export async function mergeBranch(repoPath, { name } = {}) {
  const branchName = assertSafeRefInput(name, '待合并分支');
  return withRepoLock(repoPath, async () => {
    const res = await runGit(repoPath, ['merge', '--no-edit', branchName]);
    if (!res.ok) {
      const errText = [res.stderr, res.stdout].filter(Boolean).join('\n').trim();
      throw new Error(errText || `合并分支 ${branchName} 失败`);
    }
    return { data: { merged: branchName, output: res.stdout.trim() }, gitLog: res };
  });
}

export async function listStashes(repoPath) {
  const res = await runGit(repoPath, ['stash', 'list', '--format=%gd\x1f%h\x1f%cr\x1f%gs']);
  if (!res.ok) throw new Error(res.stderr || '获取 Stash 列表失败');
  const items = res.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [ref, hash, relDate, message] = line.split('\x1f');
      return { ref, hash: hash || '', relDate: relDate || '', message: message || '' };
    });
  return { data: { stashes: items }, gitLog: res };
}

export async function saveStash(repoPath, { message = '', includeUntracked = true } = {}) {
  return withRepoLock(repoPath, async () => {
    const args = ['stash', 'push'];
    if (includeUntracked) args.push('-u');
    const msg = typeof message === 'string' ? message.trim() : '';
    if (msg) args.push('-m', msg);
    const res = await runGit(repoPath, args);
    if (!res.ok) throw new Error(res.stderr || res.stdout || '保存 Stash 失败');
    return { data: { saved: true, output: res.stdout.trim() }, gitLog: res };
  });
}

export async function applyStash(repoPath, { ref } = {}) {
  const stashRef = normalizeStashRef(ref);
  return withRepoLock(repoPath, async () => {
    const res = await runGit(repoPath, ['stash', 'apply', stashRef]);
    if (!res.ok) throw new Error(res.stderr || res.stdout || '应用 Stash 失败');
    return { data: { applied: stashRef }, gitLog: res };
  });
}

export async function popStash(repoPath, { ref } = {}) {
  const stashRef = normalizeStashRef(ref);
  return withRepoLock(repoPath, async () => {
    const res = await runGit(repoPath, ['stash', 'pop', stashRef]);
    if (!res.ok) throw new Error(res.stderr || res.stdout || '弹出 Stash 失败');
    return { data: { popped: stashRef }, gitLog: res };
  });
}

export async function dropStash(repoPath, { ref } = {}) {
  const stashRef = normalizeStashRef(ref);
  return withRepoLock(repoPath, async () => {
    const res = await runGit(repoPath, ['stash', 'drop', stashRef]);
    if (!res.ok) throw new Error(res.stderr || res.stdout || '删除 Stash 失败');
    return { data: { dropped: stashRef }, gitLog: res };
  });
}

export async function getLog(repoPath, { limit = 30, skip = 0, query = '' } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 30));
  const safeSkip = Math.max(0, Number(skip) || 0);
  const hasCommits = await checkHasCommits(repoPath);
  if (!hasCommits) {
    return { data: { commits: [], hasMore: false } };
  }

  const fmt = '%H\x1f%h\x1f%an\x1f%cr\x1f%D\x1f%s\x1e';
  const args = ['log', `--skip=${safeSkip}`, `-n`, String(safeLimit + 1), `--format=${fmt}`];
  const q = typeof query === 'string' ? query.trim() : '';
  if (q) {
    args.push('--regexp-ignore-case', `--grep=${q}`);
  }

  const res = await runGit(repoPath, args);
  if (!res.ok) throw new Error(res.stderr || '获取提交历史失败');

  const all = res.stdout
    .split('\x1e')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, shortHash, author, relDate, refsRaw, subject] = record.split('\x1f');
      const refs = refsRaw
        ? refsRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      return {
        hash,
        shortHash,
        author: author || '',
        relDate: relDate || '',
        refs,
        subject: subject || '',
      };
    });

  const hasMore = all.length > safeLimit;
  const commits = hasMore ? all.slice(0, safeLimit) : all;

  return { data: { commits, hasMore }, gitLog: res };
}

export async function getCommitDetail(repoPath, { hash } = {}) {
  const safeHash = assertSafeCommitHash(hash);
  const res = await runGit(repoPath, ['show', '--stat', '--patch', '--no-color', safeHash]);
  if (!res.ok) throw new Error(res.stderr || '获取提交详情失败');
  const { text, truncated } = truncateText(res.stdout);
  return {
    data: { hash: safeHash, detail: text, truncated },
    gitLog: res,
  };
}

export async function resetSoftLast(repoPath) {
  return withRepoLock(repoPath, async () => {
    const parentCheck = await runGit(repoPath, ['rev-parse', '--verify', 'HEAD~1']);
    if (!parentCheck.ok) {
      throw new Error('当前提交没有父提交，无法执行 reset --soft HEAD~1');
    }
    const res = await runGit(repoPath, ['reset', '--soft', 'HEAD~1']);
    if (!res.ok) throw new Error(res.stderr || '撤销最新提交失败');
    return { data: { resetSoft: true }, gitLog: res };
  });
}

export async function revertCommit(repoPath, { hash } = {}) {
  const safeHash = assertSafeCommitHash(hash);
  return withRepoLock(repoPath, async () => {
    const res = await runGit(repoPath, ['revert', '--no-edit', safeHash]);
    if (!res.ok) throw new Error(res.stderr || res.stdout || `Revert 提交 ${safeHash} 失败`);
    return { data: { reverted: safeHash }, gitLog: res };
  });
}

export async function initRepo(dirPath) {
  if (!existsSync(dirPath)) {
    throw new Error('目标目录不存在');
  }
  return withRepoLock(dirPath, async () => {
    const res = await runGit(dirPath, ['init']);
    if (!res.ok) throw new Error(res.stderr || '初始化 Git 仓库失败');
    return { data: { initialized: true, repoPath: safeRealpath(dirPath) }, gitLog: res };
  });
}

function inferCommitType(items) {
  const paths = items.map((i) => i.path.toLowerCase());
  const allDocs = paths.every((p) => p.endsWith('.md') || p.endsWith('.mdx') || p.includes('/docs/') || p.startsWith('docs/'));
  if (allDocs) return 'docs';

  const allTests = paths.every((p) => p.includes('/test/') || p.startsWith('test/') || /\.(test|spec)\.[a-z]+$/.test(p));
  if (allTests) return 'test';

  const allStyles = paths.every((p) => /\.(css|scss|less)$/.test(p));
  if (allStyles) return 'style';

  const allDeleted = items.every((i) => i.status === 'deleted' || i.code === 'D');
  if (allDeleted) return 'chore';

  const allChore = paths.every((p) =>
    /(^|\/)(\.gitignore|package\.json|install\.sh|[^/]+\.(json|ya?ml|toml|lock|conf))$/.test(p),
  );
  if (allChore) return 'chore';

  if (paths.some((p) => /fix|bug|patch/.test(p))) return 'fix';
  return 'feat';
}

function inferCommitScope(items) {
  if (items.length === 0) return '';
  const dirPartsList = items.map((item) => {
    const clean = item.path.replace(/\\/g, '/');
    const idx = clean.lastIndexOf('/');
    if (idx <= 0) return [];
    return clean.slice(0, idx).split('/').filter(Boolean);
  });

  let common = dirPartsList[0];
  for (let i = 1; i < dirPartsList.length; i++) {
    const cur = dirPartsList[i];
    let j = 0;
    while (j < common.length && j < cur.length && common[j] === cur[j]) j++;
    common = common.slice(0, j);
    if (common.length === 0) break;
  }

  const candidate = common.length > 0 ? common[common.length - 1] : '';
  if (!candidate || candidate.length > 24 || /[^a-zA-Z0-9_-]/.test(candidate)) {
    return '';
  }
  return candidate;
}

function basenameOf(relPath) {
  const clean = relPath.replace(/\\/g, '/');
  const idx = clean.lastIndexOf('/');
  return idx === -1 ? clean : clean.slice(idx + 1);
}

/**
 * 基于当前仓库差异生成规范的 Conventional Commits 草稿（支持中文/英文）。
 */
export async function suggestCommitMessage(repoPath, { stageAll: useStageAll = false, lang = 'zh' } = {}) {
  const normLang = lang === 'en' ? 'en' : 'zh';
  const statusRes = await getStatus(repoPath);
  const st = statusRes.data;

  let targets = [];
  if (!useStageAll && st.staged.length > 0) {
    targets = st.staged;
  } else {
    const map = new Map();
    for (const item of [...st.staged, ...st.unstaged, ...st.untracked]) {
      if (!map.has(item.path)) {
        map.set(item.path, item);
      }
    }
    targets = Array.from(map.values());
  }

  if (targets.length === 0) {
    return {
      data: { message: '', lang: normLang, fileCount: 0, scope: '', type: '' },
      gitLog: statusRes.gitLog,
    };
  }

  const type = inferCommitType(targets);
  const scope = inferCommitScope(targets);
  const prefix = scope ? `${type}(${scope})` : type;

  const allAdded = targets.every((i) => i.status === 'added' || i.status === 'untracked' || i.code === 'A' || i.code === '?');
  const allDeleted = targets.every((i) => i.status === 'deleted' || i.code === 'D');
  const names = targets.map((i) => basenameOf(i.path));

  let message = '';
  if (normLang === 'en') {
    const verb = allAdded ? 'add' : (allDeleted ? 'remove' : 'update');
    if (names.length === 1) {
      message = `${prefix}: ${verb} ${names[0]}`;
    } else if (names.length <= 3) {
      message = `${prefix}: ${verb} ${names.join(', ')}`;
    } else {
      message = `${prefix}: ${verb} ${names.length} files (${names.slice(0, 2).join(', ')}, ...)`;
    }
  } else {
    const verb = allAdded ? '新增' : (allDeleted ? '删除' : '更新');
    if (names.length === 1) {
      message = `${prefix}: ${verb} ${names[0]}`;
    } else if (names.length === 2) {
      message = `${prefix}: ${verb} ${names[0]} 与 ${names[1]}`;
    } else {
      message = `${prefix}: ${verb} ${names.slice(0, 2).join('、')} 等 ${names.length} 个文件`;
    }
  }

  return {
    data: {
      message,
      lang: normLang,
      fileCount: targets.length,
      scope,
      type,
    },
    gitLog: statusRes.gitLog,
  };
}

/**
 * 批量丢弃工作区所有未暂存更改与未跟踪文件。
 */
export async function discardAllUnstaged(repoPath) {
  return withRepoLock(repoPath, async () => {
    const st = (await getStatus(repoPath)).data;
    const logs = [];
    let discardedCount = 0;

    if (st.unstaged.length > 0) {
      const res = await runGit(repoPath, ['checkout', '--', '.']);
      logs.push(res);
      if (!res.ok) {
        for (const item of st.unstaged) {
          const single = await runGit(repoPath, ['restore', '--worktree', '--', item.path]);
          logs.push(single);
          if (!single.ok) throw new Error(single.stderr || res.stderr || '批量还原工作区修改失败');
        }
      }
      discardedCount += st.unstaged.length;
    }

    const root = safeRealpath(repoPath);
    for (const item of st.untracked) {
      const safePath = assertSafeRelPath(repoPath, item.path);
      const target = resolve(root, safePath);
      if (!isSubPath(root, target) || target === root) {
        throw new Error(`路径越界，拒绝删除: ${safePath}`);
      }
      rmSync(target, { recursive: true, force: true });
      discardedCount++;
    }

    return {
      data: { discardedCount },
      gitLog: logs[logs.length - 1] || {
        ok: true,
        code: 0,
        stdout: `discarded ${discardedCount} files`,
        stderr: '',
        command: 'discardAllUnstaged',
        durationMs: 1,
      },
      logs,
    };
  });
}

const OP_COMMANDS = {
  rebasing: { continue: ['rebase', '--continue'], skip: ['rebase', '--skip'], abort: ['rebase', '--abort'] },
  merging: { continue: ['merge', '--continue'], abort: ['merge', '--abort'] },
  'cherry-picking': { continue: ['cherry-pick', '--continue'], skip: ['cherry-pick', '--skip'], abort: ['cherry-pick', '--abort'] },
  reverting: { continue: ['revert', '--continue'], skip: ['revert', '--skip'], abort: ['revert', '--abort'] },
};

async function runOperationAction(repoPath, action) {
  return withRepoLock(repoPath, async () => {
    const opState = await detectRepoOperationState(repoPath);
    if (!opState || !OP_COMMANDS[opState]) {
      throw new Error('当前没有正在进行的 Merge / Rebase / Cherry-pick / Revert 操作');
    }
    const args = OP_COMMANDS[opState][action];
    if (!args) {
      throw new Error(`${opState} 状态不支持 ${action} 操作`);
    }
    const res = await runGit(repoPath, args, { env: { GIT_EDITOR: 'true' } });
    if (!res.ok) {
      const errText = [res.stderr, res.stdout].filter(Boolean).join('\n').trim();
      throw new Error(errText || `执行 ${args.join(' ')} 失败`);
    }
    return { data: { operationState: opState, action, output: res.stdout.trim() }, gitLog: res };
  });
}

export const continueOperation = (repoPath) => runOperationAction(repoPath, 'continue');
export const skipOperation = (repoPath) => runOperationAction(repoPath, 'skip');
export const abortOperation = (repoPath) => runOperationAction(repoPath, 'abort');

/**
 * 快速解决单文件冲突：ours(保留本地)、theirs(采用远端)、mark(标记为已解决)。
 */
export async function resolveConflict(repoPath, { path: relPath, strategy = 'mark' } = {}) {
  const safePath = assertSafeRelPath(repoPath, relPath);
  if (strategy !== 'ours' && strategy !== 'theirs' && strategy !== 'mark') {
    throw new Error('无效的冲突解决策略');
  }

  return withRepoLock(repoPath, async () => {
    const logs = [];
    if (strategy === 'ours' || strategy === 'theirs') {
      const coRes = await runGit(repoPath, ['checkout', `--${strategy}`, '--', safePath]);
      logs.push(coRes);
      if (!coRes.ok) {
        throw new Error(coRes.stderr || coRes.stdout || `采用 ${strategy} 失败`);
      }
    }
    const addRes = await runGit(repoPath, ['add', '--', safePath]);
    logs.push(addRes);
    if (!addRes.ok) {
      throw new Error(addRes.stderr || '标记冲突已解决失败');
    }
    return { data: { resolved: safePath, strategy }, gitLog: addRes, logs };
  });
}

/**
 * 预览 Stash 详情与完整 Diff。
 */
export async function getStashDetail(repoPath, { ref } = {}) {
  const stashRef = normalizeStashRef(ref);
  let res = await runGit(repoPath, ['stash', 'show', '--include-untracked', '--stat', '--patch', '--no-color', stashRef]);
  if (!res.ok) {
    res = await runGit(repoPath, ['stash', 'show', '--stat', '--patch', '--no-color', stashRef]);
  }
  if (!res.ok) {
    throw new Error(res.stderr || `获取 ${stashRef} 详情失败`);
  }
  const { text, truncated } = truncateText(res.stdout);
  return {
    data: { ref: stashRef, detail: text, truncated },
    gitLog: res,
  };
}

/**
 * 为 LLM 提交说明生成采集并脱敏差异上下文（绝不泄露敏感文件正文）。
 */
export async function getCommitDiffContext(repoPath, { stageAll: useStageAll = false } = {}) {
  const st = (await getStatus(repoPath)).data;
  let targets = [];
  if (!useStageAll && st.staged.length > 0) {
    targets = st.staged;
  } else {
    const map = new Map();
    for (const item of [...st.staged, ...st.unstaged, ...st.untracked]) {
      if (!map.has(item.path)) map.set(item.path, item);
    }
    targets = Array.from(map.values());
  }

  if (targets.length === 0) {
    return { branch: st.branch, fileCount: 0, files: [], recentCommits: [], diffStat: '', diffSnippet: '' };
  }

  const recentCommits = [];
  if (st.hasCommits) {
    const logRes = await runGit(repoPath, ['log', '-n', '5', '--format=%s']);
    if (logRes.ok) {
      for (const line of logRes.stdout.split('\n')) {
        if (line.trim()) recentCommits.push(line.trim());
      }
    }
  }

  const safePaths = targets.filter((t) => !t.sensitive).map((t) => t.path);
  const sensitivePaths = targets.filter((t) => t.sensitive).map((t) => t.path);
  const useStagedOnly = !useStageAll && st.staged.length > 0;

  let diffStat = '';
  let diffSnippet = '';
  const MAX_SNIPPET = 12 * 1024;

  if (safePaths.length > 0) {
    const statArgs = useStagedOnly
      ? ['diff', '--staged', '--stat', '--', ...safePaths]
      : (st.hasCommits ? ['diff', 'HEAD', '--stat', '--', ...safePaths] : ['diff', '--staged', '--stat', '--', ...safePaths]);
    const statRes = await runGit(repoPath, statArgs);
    if (statRes.ok) diffStat = statRes.stdout.trim();

    const patchArgs = useStagedOnly
      ? ['diff', '--staged', '--no-color', '--', ...safePaths]
      : (st.hasCommits ? ['diff', 'HEAD', '--no-color', '--', ...safePaths] : ['diff', '--staged', '--no-color', '--', ...safePaths]);
    const patchRes = await runGit(repoPath, patchArgs);
    if (patchRes.ok && patchRes.stdout) {
      diffSnippet = patchRes.stdout.slice(0, MAX_SNIPPET);
    }

    // 若包含未跟踪文本文件且尚有配额，补充部分未跟踪预览
    if ((!useStagedOnly || !st.hasCommits) && diffSnippet.length < MAX_SNIPPET) {
      for (const item of targets) {
        if (item.status !== 'untracked' || item.sensitive) continue;
        const preview = buildUntrackedDiff(repoPath, item.path);
        if (!preview.isBinary && preview.diff) {
          const remain = MAX_SNIPPET - diffSnippet.length;
          if (remain <= 200) break;
          diffSnippet += `\n${preview.diff.slice(0, remain)}`;
        }
      }
    }
  }

  if (sensitivePaths.length > 0) {
    diffSnippet += `\n[已自动脱敏跳过以下敏感/大文件正文内容]: ${sensitivePaths.join(', ')}`;
  }

  return {
    branch: st.branch,
    fileCount: targets.length,
    files: targets.map((t) => ({ path: t.path, status: t.status, sensitive: Boolean(t.sensitive) })),
    recentCommits,
    diffStat,
    diffSnippet: diffSnippet.trim(),
  };
}


