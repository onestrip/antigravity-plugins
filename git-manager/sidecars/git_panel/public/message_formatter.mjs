/**
 * 报警提示与 Git 活动日志本地化格式化模块（零依赖，前后端/测试共享）。
 * 中文模式下，描述文字使用简体中文，Git 与技术专业用词保持英文。
 */

const MAX_DETAIL_CHARS = 600;

export function normalizeLang(lang) {
  return lang === 'en' ? 'en' : 'zh';
}

const ROUTE_ACTION_MAP = {
  '/api/push': { zh: 'Push 推送', en: 'Push' },
  '/api/pull': { zh: 'Pull 拉取', en: 'Pull' },
  '/api/fetch': { zh: 'Fetch 获取', en: 'Fetch' },
  '/api/sync': { zh: 'Sync 同步', en: 'Sync' },
  '/api/commit': { zh: 'Commit 提交', en: 'Commit' },
  '/api/stage': { zh: 'Stage 暂存', en: 'Stage' },
  '/api/stage-all': { zh: '全部 Stage 暂存', en: 'Stage All' },
  '/api/unstage': { zh: 'Unstage 取消暂存', en: 'Unstage' },
  '/api/unstage-all': { zh: '全部 Unstage 取消暂存', en: 'Unstage All' },
  '/api/discard': { zh: '丢弃改动', en: 'Discard Changes' },
  '/api/discard-all': { zh: '丢弃全部改动', en: 'Discard All Changes' },
  '/api/checkout': { zh: '切换 Branch', en: 'Switch Branch' },
  '/api/branch/create': { zh: '创建 Branch', en: 'Create Branch' },
  '/api/branch/delete': { zh: '删除 Branch', en: 'Delete Branch' },
  '/api/branch/merge': { zh: 'Merge 合并', en: 'Merge' },
  '/api/branches': { zh: '读取 Branch 列表', en: 'List Branches' },
  '/api/stash/save': { zh: '保存 Stash', en: 'Save Stash' },
  '/api/stash/apply': { zh: '应用 Stash', en: 'Apply Stash' },
  '/api/stash/pop': { zh: '弹出 Stash', en: 'Pop Stash' },
  '/api/stash/drop': { zh: '删除 Stash', en: 'Drop Stash' },
  '/api/stashes': { zh: '读取 Stash 列表', en: 'List Stashes' },
  '/api/stash/detail': { zh: '加载 Stash Diff', en: 'Load Stash Diff' },
  '/api/reset-soft': { zh: 'Soft Reset 撤销 Commit', en: 'Soft Reset' },
  '/api/revert': { zh: 'Revert 回滚', en: 'Revert' },
  '/api/operation/continue': { zh: '继续当前操作', en: 'Continue Operation' },
  '/api/operation/skip': { zh: '跳过当前 Commit', en: 'Skip Commit' },
  '/api/operation/abort': { zh: '中止当前操作', en: 'Abort Operation' },
  '/api/conflict/resolve': { zh: '解决 Conflict', en: 'Resolve Conflict' },
  '/api/init': { zh: '初始化 Git 仓库', en: 'Init Repository' },
  '/api/status': { zh: '读取 Git 状态', en: 'Git Status' },
  '/api/diff': { zh: '加载 Diff', en: 'Load Diff' },
  '/api/log': { zh: '读取 Commit 历史', en: 'Commit History' },
  '/api/commit-detail': { zh: '加载 Commit 详情', en: 'Commit Detail' },
  '/api/repos': { zh: '扫描 Git 仓库', en: 'Scan Repositories' },
  '/api/suggest-message': { zh: 'AI 生成 Commit 说明', en: 'AI Commit Message' },
};

export function getActionLabel(commandOrRoute, lang = 'zh') {
  const normLang = normalizeLang(lang);
  const raw = String(commandOrRoute || '').trim();
  if (!raw) {
    return normLang === 'en' ? 'Git Operation' : 'Git 操作';
  }

  if (ROUTE_ACTION_MAP[raw]) {
    return ROUTE_ACTION_MAP[raw][normLang];
  }
  if (raw === 'frontend-runtime') {
    return normLang === 'en' ? 'Frontend Runtime' : '前端运行时';
  }
  if (raw === 'discardAllUnstaged') {
    return normLang === 'en' ? 'Discard All Changes' : '丢弃全部改动';
  }
  if (raw.startsWith('rm ')) {
    return normLang === 'en' ? 'Delete untracked file' : '删除 untracked 文件';
  }

  const lower = raw.toLowerCase();
  if (lower.startsWith('git ')) {
    const rest = raw.slice(4).trim();
    const parts = rest.split(/\s+/);
    const sub = (parts[0] || '').toLowerCase();

    if (sub === 'push') return normLang === 'en' ? 'Push' : 'Push 推送';
    if (sub === 'pull') return normLang === 'en' ? 'Pull' : 'Pull 拉取';
    if (sub === 'fetch') return normLang === 'en' ? 'Fetch' : 'Fetch 获取';
    if (sub === 'commit') return normLang === 'en' ? 'Commit' : 'Commit 提交';
    if (sub === 'add') return normLang === 'en' ? 'Stage' : 'Stage 暂存';
    if (sub === 'reset') {
      if (parts.includes('--soft')) return normLang === 'en' ? 'Soft Reset' : 'Soft Reset 撤销 Commit';
      return normLang === 'en' ? 'Unstage' : 'Unstage 取消暂存';
    }
    if (sub === 'rm' && parts.includes('--cached')) {
      return normLang === 'en' ? 'Unstage' : 'Unstage 取消暂存';
    }
    if (sub === 'restore') return normLang === 'en' ? 'Discard Changes' : '丢弃改动';
    if (sub === 'checkout') {
      if (parts.includes('--ours') || parts.includes('--theirs')) {
        return normLang === 'en' ? 'Resolve Conflict' : '解决 Conflict';
      }
      if (parts.includes('--')) {
        return normLang === 'en' ? 'Discard Changes' : '丢弃改动';
      }
      return normLang === 'en' ? 'Switch Branch' : '切换 Branch';
    }
    if (sub === 'switch') {
      if (parts.includes('-c') || parts.includes('-C')) {
        return normLang === 'en' ? 'Create Branch' : '创建 Branch';
      }
      return normLang === 'en' ? 'Switch Branch' : '切换 Branch';
    }
    if (sub === 'branch') {
      if (parts.includes('-d') || parts.includes('-D')) {
        return normLang === 'en' ? 'Delete Branch' : '删除 Branch';
      }
      return normLang === 'en' ? 'Create Branch' : '创建 Branch';
    }
    if (sub === 'merge') {
      if (parts.includes('--continue')) return normLang === 'en' ? 'Continue Merge' : '继续 Merge';
      if (parts.includes('--abort')) return normLang === 'en' ? 'Abort Merge' : '中止 Merge';
      return normLang === 'en' ? 'Merge' : 'Merge 合并';
    }
    if (sub === 'rebase') {
      if (parts.includes('--continue')) return normLang === 'en' ? 'Continue Rebase' : '继续 Rebase';
      if (parts.includes('--skip')) return normLang === 'en' ? 'Skip Rebase Commit' : '跳过 Rebase Commit';
      if (parts.includes('--abort')) return normLang === 'en' ? 'Abort Rebase' : '中止 Rebase';
      return normLang === 'en' ? 'Rebase' : 'Rebase 变基';
    }
    if (sub === 'cherry-pick') {
      if (parts.includes('--continue')) return normLang === 'en' ? 'Continue Cherry-pick' : '继续 Cherry-pick';
      if (parts.includes('--skip')) return normLang === 'en' ? 'Skip Cherry-pick Commit' : '跳过 Cherry-pick Commit';
      if (parts.includes('--abort')) return normLang === 'en' ? 'Abort Cherry-pick' : '中止 Cherry-pick';
      return normLang === 'en' ? 'Cherry-pick' : 'Cherry-pick 拣选';
    }
    if (sub === 'revert') {
      if (parts.includes('--continue')) return normLang === 'en' ? 'Continue Revert' : '继续 Revert';
      if (parts.includes('--skip')) return normLang === 'en' ? 'Skip Revert Commit' : '跳过 Revert Commit';
      if (parts.includes('--abort')) return normLang === 'en' ? 'Abort Revert' : '中止 Revert';
      return normLang === 'en' ? 'Revert' : 'Revert 回滚';
    }
    if (sub === 'stash') {
      const action = (parts[1] || '').toLowerCase();
      if (action === 'push' || action === 'save') return normLang === 'en' ? 'Save Stash' : '保存 Stash';
      if (action === 'apply') return normLang === 'en' ? 'Apply Stash' : '应用 Stash';
      if (action === 'pop') return normLang === 'en' ? 'Pop Stash' : '弹出 Stash';
      if (action === 'drop') return normLang === 'en' ? 'Drop Stash' : '删除 Stash';
      if (action === 'list') return normLang === 'en' ? 'List Stashes' : '读取 Stash 列表';
      if (action === 'show') return normLang === 'en' ? 'Load Stash Diff' : '加载 Stash Diff';
      return normLang === 'en' ? 'Stash' : 'Stash 贮藏';
    }
    if (sub === 'init') return normLang === 'en' ? 'Init Repository' : '初始化 Git 仓库';
    if (sub === 'status') return normLang === 'en' ? 'Git Status' : '读取 Git 状态';
    if (sub === 'diff') return normLang === 'en' ? 'Load Diff' : '加载 Diff';
    if (sub === 'log') return normLang === 'en' ? 'Commit History' : '读取 Commit 历史';
    if (sub === 'show') return normLang === 'en' ? 'Commit Detail' : '加载 Commit 详情';
    if (sub === 'for-each-ref' || sub === 'worktree') {
      return normLang === 'en' ? 'List Branches' : '读取 Branch 列表';
    }
    if (sub) return `Git ${sub}`;
  }

  return normLang === 'en' ? 'Git Operation' : 'Git 操作';
}

function hasChinese(text) {
  return /[\u4e00-\u9fa5]/.test(text);
}

function cleanRawOutput(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function truncateDetail(text, max = MAX_DETAIL_CHARS) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function extractKeyErrorLine(raw) {
  const lines = cleanRawOutput(raw)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return '';

  const nonHint = lines.filter((l) => !/^hint:/i.test(l));
  const pool = nonHint.length > 0 ? nonHint : lines;

  const preferred =
    pool.find((l) => /^(fatal:|error:|!\s+\[rejected\]|!\s+\[remote rejected\]|CONFLICT\s)/i.test(l)) ||
    pool[0];

  return preferred.replace(/^(fatal|error):\s*/i, '').trim();
}

function extractConflictFiles(raw) {
  const files = [];
  const regexList = [
    /CONFLICT\s*\([^)]+\):\s*Merge conflict in\s+(.+)/gi,
    /CONFLICT\s*\([^)]+\):\s*.*?in\s+(.+)/gi,
    /^([A-Za-z0-9_.\-/\\]+):\s+needs merge$/gim,
  ];
  for (const re of regexList) {
    let m;
    while ((m = re.exec(raw)) !== null) {
      const f = m[1].trim().replace(/^["']|["']$/g, '');
      if (f && !files.includes(f)) files.push(f);
      if (files.length >= 3) return files;
    }
  }
  return files;
}

function extractOverwrittenFiles(raw, anchorRegex) {
  const lines = cleanRawOutput(raw).split('\n');
  const idx = lines.findIndex((l) => anchorRegex.test(l));
  if (idx === -1) return [];
  const files = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed) break;
    if (/^(Please commit|Aborting|Updating|error:|fatal:)/i.test(trimmed)) break;
    if (/^\s+/.test(rawLine)) {
      files.push(trimmed);
      if (files.length >= 3) break;
    } else {
      break;
    }
  }
  return files;
}

const ZH_ERROR_RULES = [
  {
    test: (t) => /\(stale info\)/i.test(t),
    format: () => 'Push 被拒绝（stale info）：Remote Branch 已被更新，请先 Fetch 确认后再使用 --force-with-lease',
  },
  {
    test: (t) => /non-fast-forward|fetch first|tip of your current branch is behind|remote contains work that you do not have locally/i.test(t),
    format: () => 'Push 被拒绝（non-fast-forward）：Remote 存在更新的 Commit，请先 Pull 或 Sync 后再 Push',
  },
  {
    test: (t) => /pre-receive hook declined|protected branch|GH006/i.test(t),
    format: () => 'Push 被 Remote Hook 或保护 Branch 规则拦截',
  },
  {
    test: (t) => /has no upstream branch|no tracking information for the current branch/i.test(t),
    format: () => '当前 Branch 尚未设置 Upstream，请先关联 Remote Branch',
  },
  {
    test: (t) => /CONFLICT\s*\(|Merge conflict in|Automatic merge failed|could not apply|fix conflicts and then commit/i.test(t),
    format: (t) => {
      const files = extractConflictFiles(t);
      const suffix = files.length > 0 ? `（涉及: ${files.join(', ')}）` : '';
      return `检测到 Merge / Rebase Conflict${suffix}，请先解决 Conflict 后继续或中止`;
    },
  },
  {
    test: (t) => /Committing is not possible because you have unmerged files|Pulling is not possible because you have unmerged files|You have not concluded your merge|unresolved conflict/i.test(t),
    format: () => '存在未解决的 Conflict 文件，请先解决 Conflict 并 Stage 后再继续',
  },
  {
    test: (t) => /Your local changes to the following files would be overwritten by/i.test(t),
    format: (t) => {
      const files = extractOverwrittenFiles(t, /Your local changes to the following files would be overwritten by/i);
      const suffix = files.length > 0 ? `（涉及: ${files.join(', ')}）` : '';
      return `本地未提交改动会被覆盖${suffix}，请先 Commit 或 Stash 后再操作`;
    },
  },
  {
    test: (t) => /Please commit your changes or stash them before you/i.test(t),
    format: () => '本地存在未提交改动，请先 Commit 或 Stash 后再继续当前操作',
  },
  {
    test: (t) => /The following untracked working tree files would be overwritten by/i.test(t),
    format: (t) => {
      const files = extractOverwrittenFiles(t, /The following untracked working tree files would be overwritten by/i);
      const suffix = files.length > 0 ? `（涉及: ${files.join(', ')}）` : '';
      return `工作区存在 untracked 文件会被覆盖${suffix}，请先清理、Commit 或 Stash 后再操作`;
    },
  },
  {
    test: (t) => /cannot pull with rebase:\s*You have unstaged changes|Your index contains uncommitted changes/i.test(t),
    format: () => '存在未暂存或未提交改动，无法执行 Pull --rebase，请先 Commit 或 Stash 后重试',
  },
  {
    test: (t) => /divergent branches|Need to specify how to reconcile divergent branches/i.test(t),
    format: () => '本地与 Remote Branch 已分叉（divergent），请开启 Pull Rebase 或手动 Merge',
  },
  {
    test: (t) => /refusing to merge unrelated histories/i.test(t),
    format: () => '拒绝合并无共同提交历史的 Branch（unrelated histories）',
  },
  {
    test: (t) => /is not fully merged/i.test(t),
    format: (t) => {
      const m = /branch\s+['"]?([^'"\s]+)['"]?\s+is not fully merged/i.exec(t);
      const name = m ? `"${m[1]}" ` : '';
      return `Branch ${name}尚未完全 Merge，普通删除被拒绝（如需删除请确认强制删除 -D）`;
    },
  },
  {
    test: (t) => /a branch named\s+['"][^'"]+['"]\s+already exists/i.test(t),
    format: (t) => {
      const m = /a branch named\s+['"]([^'"]+)['"]\s+already exists/i.exec(t);
      return `Branch "${m ? m[1] : ''}" 已存在`;
    },
  },
  {
    test: (t) => /nothing to commit,\s*working tree clean|no changes added to commit|nothing added to commit/i.test(t),
    format: () => '工作区干净，没有可 Commit 的改动',
  },
  {
    test: (t) => /Author identity unknown|Please tell me who you are|unable to auto-detect email address/i.test(t),
    format: () => '尚未配置 Git 用户身份（user.name / user.email），请先完成配置后再 Commit',
  },
  {
    test: (t) => /index\.lock['"]?:\s*File exists|Unable to create\s+['"]?.*index\.lock/i.test(t),
    format: () => '检测到 Git Index 锁文件（.git/index.lock），可能有其他 Git 进程正在运行，请稍后重试',
  },
  {
    test: (t) => /cannot lock ref/i.test(t),
    format: () => '无法锁定 Git Ref，可能存在并发操作或 Remote 引用冲突，请先 Fetch 后重试',
  },
  {
    test: (t) => /Authentication failed|could not read Username|Terminal prompts disabled|Permission denied \(publickey\)|Access denied|returned error:\s*401|returned error:\s*403/i.test(t),
    format: () => 'Remote 认证或权限校验失败，请检查凭据、Token 或 SSH Key 配置',
  },
  {
    test: (t) => /repository\s+['"]?[^'"]+['"]?\s+not found|Repository not found|does not appear to be a git repository|Could not read from remote repository/i.test(t),
    format: () => '无法访问 Remote 仓库，请检查 Remote URL、仓库是否存在或 SSH/HTTPS 权限',
  },
  {
    test: (t) => /Could not resolve host|Failed to connect|Connection timed out|Connection reset|unable to access|SSL|TLS|Recv failure|Empty reply from server/i.test(t),
    format: () => '无法连接 Remote 仓库（网络异常或连接超时），请检查网络与代理设置',
  },
  {
    test: (t) => /did not match any file\(s\) known to git|not something we can merge|invalid reference|not a valid object name|unknown revision|bad revision/i.test(t),
    format: () => '找不到指定的 Branch、Commit 或路径引用',
  },
  {
    test: (t) => /No local changes to save/i.test(t),
    format: () => '工作区没有可保存到 Stash 的本地改动',
  },
  {
    test: (t) => /No stash entries found/i.test(t),
    format: () => '当前没有可用的 Stash 记录',
  },
  {
    test: (t) => /pre-commit|commit-msg|pre-push|hook failed/i.test(t),
    format: () => 'Git Hook 检查未通过，操作已被拦截',
  },
  {
    test: (t) => /not a git repository/i.test(t),
    format: () => '当前目录不是有效的 Git 仓库',
  },
  {
    test: (t) => /You are not currently on a branch/i.test(t),
    format: () => '当前处于 Detached HEAD 状态，请先切换到有效 Branch',
  },
  {
    test: (t) => /ETIMEDOUT|timed out/i.test(t),
    format: () => 'Git 命令执行超时，请检查网络或仓库状态后重试',
  },
  {
    test: (t) => /^HTTP\s+[45]\d\d|Failed to fetch|NetworkError/i.test(t),
    format: () => 'Sidecar 服务通信失败，请刷新面板或重启插件',
  },
];

const ZH_TO_EN_EXACT = {
  '操作失败': 'Operation failed',
  '未知错误': 'Unknown error',
  '缺少仓库路径 repoPath': 'Missing repository path (repoPath)',
  '目标路径不在当前工作区允许的仓库范围内': 'Target path is outside the allowed workspace repositories',
  '该目录尚未初始化为 Git 仓库': 'This directory has not been initialized as a Git repository',
  '无效的文件路径': 'Invalid file path',
  '不允许传入绝对文件路径': 'Absolute file paths are not allowed',
  '文件路径越出仓库根目录': 'File path escapes the repository root',
  '无效的提交哈希': 'Invalid Commit hash',
  '无效的 Stash 引用': 'Invalid Stash reference',
  '获取 Git 状态失败': 'Failed to read Git status',
  '获取 Diff 失败': 'Failed to load Diff',
  '请选择要暂存的文件': 'Please select files to Stage',
  '暂存文件失败': 'Failed to Stage files',
  '全部暂存失败': 'Failed to Stage all changes',
  '请选择要取消暂存的文件': 'Please select files to Unstage',
  '取消暂存失败': 'Failed to Unstage files',
  '全部取消暂存失败': 'Failed to Unstage all changes',
  '路径越界，拒绝删除': 'Path escapes repository root; deletion refused',
  '丢弃改动失败': 'Failed to discard changes',
  '请填写提交说明（Commit Message）': 'Please enter a Commit Message',
  '自动暂存全部改动失败': 'Failed to auto-stage all changes',
  '提交失败': 'Commit failed',
  'Fetch 失败': 'Fetch failed',
  '拉取失败': 'Pull failed',
  '当前处于游离 HEAD 状态，请先切换到分支后再推送': 'Detached HEAD state: please switch to a Branch before Push',
  '当前分支尚无任何提交，请先提交后再推送': 'Current Branch has no Commits yet; please Commit before Push',
  '当前分支尚未设置上游跟踪分支': 'Current Branch has no Upstream tracking Branch',
  '尚未配置远程仓库（remote），无法推送': 'No Remote repository configured; cannot Push',
  '推送失败': 'Push failed',
  '同步失败：Fetch 阶段出错': 'Sync failed during Fetch stage',
  '存在未解决的冲突文件，请先处理冲突后再同步': 'Unresolved Conflicts remain; please resolve Conflicts before Sync',
  '获取分支列表失败': 'Failed to list Branches',
  '不能删除当前正在使用的分支，请先切换到其他分支': 'Cannot delete the currently checked-out Branch; switch to another Branch first',
  '获取 Stash 列表失败': 'Failed to list Stashes',
  '保存 Stash 失败': 'Failed to save Stash',
  '应用 Stash 失败': 'Failed to apply Stash',
  '弹出 Stash 失败': 'Failed to pop Stash',
  '删除 Stash 失败': 'Failed to drop Stash',
  '获取提交历史失败': 'Failed to load Commit history',
  '获取提交详情失败': 'Failed to load Commit detail',
  '当前提交没有父提交，无法执行 reset --soft HEAD~1': 'Current Commit has no parent; cannot run reset --soft HEAD~1',
  '撤销最新提交失败': 'Failed to Soft Reset latest Commit',
  '目标目录不存在': 'Target directory does not exist',
  '初始化 Git 仓库失败': 'Failed to initialize Git repository',
  '批量还原工作区修改失败': 'Failed to discard working tree changes',
  '当前没有正在进行的 Merge / Rebase / Cherry-pick / Revert 操作': 'No ongoing Merge / Rebase / Cherry-pick / Revert operation',
  '无效的冲突解决策略': 'Invalid Conflict resolution strategy',
  '标记冲突已解决失败': 'Failed to mark Conflict as resolved',
  '缺少 Language Server 地址或 CSRF 令牌': 'Missing Language Server address or CSRF token',
  '无法定位 Antigravity 数据目录': 'Unable to locate Antigravity data directory',
  '未返回临时会话 ID': 'Temporary conversation ID was not returned',
  'LLM 生成提交说明超时': 'LLM Commit message generation timed out',
  'LLM 未返回有效提交说明': 'LLM did not return a valid Commit message',
  '请输入新分支名称': 'Please enter a new Branch name',
  '扫描 Git 仓库失败': 'Failed to scan Git repositories',
};

function translateZhBusinessErrorToEn(text) {
  if (ZH_TO_EN_EXACT[text]) return ZH_TO_EN_EXACT[text];

  let m;
  if ((m = /^(.+?)不能为空$/.exec(text))) {
    const label = m[1] === '分支名称' ? 'Branch name' : (m[1] === '目标分支' ? 'Target Branch' : (m[1] === '起点分支' ? 'Start-point Branch' : (m[1] === '待合并分支' ? 'Branch to merge' : 'Reference name')));
    return `${label} cannot be empty`;
  }
  if ((m = /^(.+?)格式非法[:：]\s*(.+)$/.exec(text))) {
    return `Invalid reference format: ${m[2]}`;
  }
  if ((m = /^分支名称不符合 Git 规范[:：]\s*(.+)$/.exec(text))) {
    return `Invalid Git Branch name: ${m[1]}`;
  }
  if ((m = /^切换分支\s+(.+?)\s+失败$/.exec(text))) {
    return `Failed to switch to Branch ${m[1]}`;
  }
  if ((m = /^创建分支\s+(.+?)\s+失败$/.exec(text))) {
    return `Failed to create Branch ${m[1]}`;
  }
  if ((m = /^删除分支\s+(.+?)\s+失败$/.exec(text))) {
    return `Failed to delete Branch ${m[1]}`;
  }
  if ((m = /^合并分支\s+(.+?)\s+失败$/.exec(text))) {
    return `Failed to merge Branch ${m[1]}`;
  }
  if ((m = /^Revert 提交\s+(.+?)\s+失败$/.exec(text))) {
    return `Failed to revert Commit ${m[1]}`;
  }
  if ((m = /^获取\s+(stash@\{\d+\})\s+详情失败$/.exec(text))) {
    return `Failed to load details for ${m[1]}`;
  }
  if ((m = /^路径越界，拒绝删除[:：]\s*(.+)$/.exec(text))) {
    return `Path escapes repository root; deletion refused: ${m[1]}`;
  }
  if ((m = /^采用\s+(ours|theirs)\s+失败$/.exec(text))) {
    return `Failed to apply --${m[1]}`;
  }
  if ((m = /^(\S+)\s+状态不支持\s+(\S+)\s+操作$/.exec(text))) {
    return `Operation ${m[2]} is not supported during ${m[1]}`;
  }
  if ((m = /^执行\s+(.+?)\s+失败$/.exec(text))) {
    return `Failed to run ${m[1]}`;
  }
  return text;
}

export function formatErrorMessage(rawError, { lang = 'zh', command = '', route = '' } = {}) {
  const normLang = normalizeLang(lang);
  const cleaned = cleanRawOutput(rawError);

  if (!cleaned) {
    const fallback = normLang === 'en' ? 'Operation failed' : '操作失败';
    return { summary: fallback, detail: fallback, matched: false };
  }

  // 处理 sync() 抛出的阶段嵌套前缀
  if (/^同步失败[：:]\s*Fetch\s*阶段出错$/.test(cleaned)) {
    const msg = normLang === 'en' ? 'Sync failed (Fetch stage)' : 'Sync 失败（Fetch 阶段）';
    return { summary: msg, detail: msg, matched: true };
  }
  const syncStageMatch = /^同步失败（(Pull|Push)\s*阶段）[：:]\s*([\s\S]+)$/.exec(cleaned);
  if (syncStageMatch) {
    const stage = syncStageMatch[1];
    const inner = syncStageMatch[2].trim();
    const innerFmt = formatErrorMessage(inner, { lang: normLang, command, route });
    const summary = normLang === 'en'
      ? `Sync failed (${stage}): ${innerFmt.summary}`
      : `Sync 失败（${stage} 阶段）：${innerFmt.summary}`;
    const detail = innerFmt.detail && innerFmt.detail !== innerFmt.summary
      ? `${summary}\n${innerFmt.detail.split('\n').slice(1).join('\n')}`
      : summary;
    return { summary, detail, matched: true };
  }

  if (normLang === 'en') {
    if (hasChinese(cleaned)) {
      const translated = translateZhBusinessErrorToEn(cleaned);
      return { summary: translated, detail: translated, matched: translated !== cleaned };
    }
    const keyLine = extractKeyErrorLine(cleaned) || cleaned;
    const truncated = truncateDetail(cleaned);
    return {
      summary: keyLine,
      detail: truncated,
      matched: false,
    };
  }

  // 中文模式
  for (const rule of ZH_ERROR_RULES) {
    if (rule.test(cleaned)) {
      const summary = rule.format(cleaned);
      const truncated = truncateDetail(cleaned);
      const detail = hasChinese(cleaned) && cleaned === summary
        ? summary
        : `${summary}\n原始输出:\n${truncated}`;
      return { summary, detail, matched: true };
    }
  }

  if (hasChinese(cleaned)) {
    const firstLine = cleaned.split('\n').map((l) => l.trim()).find(Boolean) || cleaned;
    const summary = truncateDetail(firstLine, 160);
    return {
      summary,
      detail: truncateDetail(cleaned),
      matched: true,
    };
  }

  const actionLabel = getActionLabel(command || route, 'zh');
  const keyLine = extractKeyErrorLine(cleaned) || cleaned;
  const prefix = actionLabel === 'Git 操作' ? 'Git 操作失败' : `${actionLabel}失败`;
  const summary = `${prefix}：${truncateDetail(keyLine, 140)}`;
  const detail = `${summary}\n原始输出:\n${truncateDetail(cleaned)}`;
  return { summary, detail, matched: false };
}

function localizeSuccessOutput(rawOutput, lang) {
  const cleaned = cleanRawOutput(rawOutput);
  if (!cleaned) return '';
  if (lang === 'en') return truncateDetail(cleaned);

  if (/^Already up to date\.?$/i.test(cleaned)) {
    return '已是最新状态，无需更新';
  }
  if (/^Everything up-to-date$/i.test(cleaned)) {
    return 'Remote 已是最新状态（Everything up-to-date）';
  }
  if (/^No local changes to save$/i.test(cleaned)) {
    return '工作区没有可保存到 Stash 的本地改动';
  }
  if (/^Fast-forward$/i.test(cleaned)) {
    return 'Fast-forward 合并完成';
  }

  let m;
  if ((m = /^Saved working directory and index state\s+(.+)$/i.exec(cleaned))) {
    return `已保存改动到 Stash（${m[1]}）`;
  }
  if ((m = /^Switched to branch\s+'([^']+)'/i.exec(cleaned))) {
    return `已切换到 Branch: ${m[1]}`;
  }
  if ((m = /^Switched to a new branch\s+'([^']+)'/i.exec(cleaned))) {
    return `已创建并切换到新 Branch: ${m[1]}`;
  }
  if ((m = /^Deleted branch\s+(\S+)\s+\(was\s+([^)]+)\)\.?$/i.exec(cleaned))) {
    return `已删除 Branch: ${m[1]} (${m[2]})`;
  }
  if (/^Successfully rebased and updated/i.test(cleaned)) {
    return 'Rebase 已完成并更新 Branch';
  }
  if (/^Dropped\s+(stash@\{\d+\}|refs\/stash)/i.test(cleaned)) {
    return `已删除 Stash 记录\n${truncateDetail(cleaned)}`;
  }
  if ((m = /^discarded\s+(\d+)\s+files?$/i.exec(cleaned))) {
    return `已丢弃 ${m[1]} 个文件的未暂存改动`;
  }
  if ((m = /^removed untracked\s+(.+)$/i.exec(cleaned))) {
    return `已删除 untracked 文件: ${m[1]}`;
  }
  if ((m = /^Initialized empty Git repository in\s+(.+)$/i.exec(cleaned))) {
    return `已初始化空 Git 仓库: ${m[1]}`;
  }
  if ((m = /^Branch\s+'([^']+)'\s+set up to track\s+(.+)\.?$/i.exec(cleaned))) {
    return `已将 Branch ${m[1]} 关联至 Upstream: ${m[2]}`;
  }

  return truncateDetail(cleaned);
}

export function formatLogEntry(entry = {}, lang = 'zh') {
  const normLang = normalizeLang(lang);
  const ok = Boolean(entry.ok);
  const time = entry.time || '';
  const durationMs = entry.durationMs ?? 0;
  const rawCommand = String(entry.command || '').trim();
  const route = String(entry.route || '').trim();

  const isInternalRoute =
    !rawCommand ||
    rawCommand.startsWith('/') ||
    rawCommand === 'frontend-runtime';

  const actionLabel = getActionLabel(rawCommand || route, normLang);
  const rawOutput = [entry.stderr, entry.stdout, entry.error, entry.output]
    .filter(Boolean)
    .join('\n')
    .trim();

  if (normLang === 'en') {
    const displayCmd = !isInternalRoute ? rawCommand : actionLabel;
    const headText = `[${time}] ${ok ? '✓' : '✗'} ${displayCmd} (${durationMs}ms)`;
    if (ok) {
      return {
        headText,
        lastSummaryText: `✓ ${displayCmd} (${durationMs}ms)`,
        bodyText: localizeSuccessOutput(rawOutput, 'en'),
        troubleshootLabel: 'Ask Agent',
      };
    }
    const formatted = formatErrorMessage(rawOutput, { lang: 'en', command: rawCommand, route });
    return {
      headText,
      lastSummaryText: `✗ ${displayCmd} · ${formatted.summary} (${durationMs}ms)`,
      bodyText: formatted.detail,
      troubleshootLabel: 'Ask Agent',
    };
  }

  const cmdSuffix = !isInternalRoute ? ` · ${rawCommand}` : '';
  const headText = `[${time}] ${ok ? '✓' : '✗'} ${actionLabel}${cmdSuffix} (${durationMs}ms)`;

  if (ok) {
    return {
      headText,
      lastSummaryText: `✓ ${actionLabel} (${durationMs}ms)`,
      bodyText: localizeSuccessOutput(rawOutput, 'zh'),
      troubleshootLabel: '交给 Agent 排查',
    };
  }

  const formatted = formatErrorMessage(rawOutput, { lang: 'zh', command: rawCommand, route });
  return {
    headText,
    lastSummaryText: `✗ ${actionLabel} · ${formatted.summary} (${durationMs}ms)`,
    bodyText: formatted.detail,
    troubleshootLabel: '交给 Agent 排查',
  };
}
