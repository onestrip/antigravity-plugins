/**
 * Antigravity 原生 Git 管理侧边面板前端脚本（经典自包含脚本，兼容受限 Webview 沙盒）。
 */
const GitManagerFormatter = (() => {
  'use strict';

  const MAX_DETAIL_CHARS = 600;

  function normalizeLang(lang) {
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

  function getActionLabel(commandOrRoute, lang = 'zh') {
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

  function formatErrorMessage(rawError, { lang = 'zh', command = '', route = '' } = {}) {
    const normLang = normalizeLang(lang);
    const cleaned = cleanRawOutput(rawError);

    if (!cleaned) {
      const fallback = normLang === 'en' ? 'Operation failed' : '操作失败';
      return { summary: fallback, detail: fallback, matched: false };
    }

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

  function formatLogEntry(entry = {}, lang = 'zh') {
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

  return {
    normalizeLang,
    getActionLabel,
    formatErrorMessage,
    formatLogEntry,
  };
})();

globalThis.__GIT_MANAGER_FORMATTER__ = GitManagerFormatter;

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
(() => {
  'use strict';

  const { formatErrorMessage, formatLogEntry, normalizeLang } = GitManagerFormatter;
  const EXPECTED_SERVER_VERSION = '1.3.0';
  const SETTINGS_STORAGE_KEY = 'agy_git_manager_settings_v1';
  const AUTO_FETCH_INTERVAL_MS = 90_000;
  const HISTORY_PAGE_SIZE = 30;

  const SVG_ICONS = {
    open: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5H3.8A1.3 1.3 0 0 0 2.5 4.8v7.4a1.3 1.3 0 0 0 1.3 1.3h7.4a1.3 1.3 0 0 0 1.3-1.3V9.5"/><path d="M9.5 2.5h4v4M8 8l5.5-5.5"/></svg>',
    plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3.2v9.6M3.2 8h9.6"/></svg>',
    minus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3.2 8h9.6"/></svg>',
    discard: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 4.5 2.5 7l3 2.5"/><path d="M2.8 7H9a3.5 3.5 0 1 1 0 7H6.5"/></svg>',
  };

  const OP_LABELS = {
    rebasing: '变基（Rebase）进行中',
    merging: '合并（Merge）进行中',
    'cherry-picking': '拣选（Cherry-pick）进行中',
    reverting: '回滚（Revert）进行中',
  };

  const state = {
    workspaceUris: [],
    repos: [],
    activeRepo: '',
    status: null,
    statusFingerprint: '',
    branches: null,
    stashes: null,
    history: null,
    historyQuery: '',
    activeTab: 'changes',
    changesQuery: '',
    stageAllUserTouched: false,
    expandedDiffs: new Map(), // key -> { loading, data, error }
    expandedStashes: new Map(), // ref -> { loading, data, error }
    expandedCommits: new Map(), // hash -> { loading, data, error }
    logs: [],
    hasUnreadError: false,
    busy: false,
    lastFetchAt: 0,
    autoFetchInFlight: false,
    pollingTimer: null,
    updateBannerDismissed: false,
    settings: {
      commitLang: 'zh',
      pullRebase: true,
      autoFetch: true,
      forceWithLease: false,
      defaultStageAll: false,
    },
  };

  const $ = (id) => document.getElementById(id);

  function getCurrentLang() {
    return normalizeLang(state.settings.commitLang);
  }

  function getConversationId() {
    if (window.sidecar?.conversationId) return window.sidecar.conversationId;
    try {
      return new URLSearchParams(window.location.search).get('conversationId') || '';
    } catch {
      return '';
    }
  }

  function checkServerVersion(serverVersion) {
    if (state.updateBannerDismissed) return;
    const mismatch = serverVersion !== EXPECTED_SERVER_VERSION;
    $('server-update-banner').classList.toggle('hidden', !mismatch);
  }

  function reportFatalError(title, detail) {
    const lang = getCurrentLang();
    const formatted = formatErrorMessage(detail || '', { lang, command: 'frontend-runtime' });
    const displayTitle = lang === 'en' && title === '面板脚本运行异常'
      ? 'Panel Runtime Error'
      : (lang === 'en' && title === '面板异步请求异常' ? 'Panel Async Request Error' : title);

    const emptyState = $('empty-state');
    const workspaceMain = $('workspace-main');
    if (emptyState && workspaceMain) {
      workspaceMain.classList.add('hidden');
      emptyState.classList.remove('hidden');
      $('empty-title').textContent = displayTitle;
      $('empty-desc').textContent = formatted.summary;
      $('empty-actions').classList.add('hidden');
    }
    state.hasUnreadError = true;
    state.logs.unshift({
      time: new Date().toLocaleTimeString(),
      command: 'frontend-runtime',
      route: '',
      ok: false,
      durationMs: 0,
      stdout: '',
      stderr: '',
      error: `${displayTitle}: ${detail}`,
    });
    if (state.logs.length > 30) state.logs.length = 30;
    renderLogs();
  }

  window.addEventListener('error', (event) => {
    reportFatalError('面板脚本运行异常', event?.message || '未知前端错误');
  });

  window.addEventListener('unhandledrejection', (event) => {
    const msg = event?.reason?.message || String(event?.reason || '未知异步错误');
    reportFatalError('面板异步请求异常', msg);
  });

  function sidecarFetch(url, body = {}) {
    const f = window.sidecar?.fetch ? window.sidecar.fetch.bind(window.sidecar) : fetch;
    return f(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async (res) => {
      const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
      return json;
    });
  }

  function showToast(message, type = 'info') {
    const container = $('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    const duration = type === 'error' ? 5200 : 3600;
    setTimeout(() => {
      el.remove();
    }, duration);
  }

  function readLocalSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeLocalSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // 忽略沙盒限制
    }
  }

  function applySettingsToUI() {
    const { commitLang, pullRebase, autoFetch, forceWithLease, defaultStageAll } = state.settings;
    document.querySelectorAll('.seg-btn[data-lang]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lang === commitLang);
    });
    $('opt-default-stage-all').checked = Boolean(defaultStageAll);
    $('opt-pull-rebase').checked = Boolean(pullRebase);
    $('opt-auto-fetch').checked = Boolean(autoFetch);
    $('opt-force-lease').checked = Boolean(forceWithLease);
    $('commit-lang-pill').textContent = commitLang === 'en' ? 'AI: EN' : 'AI: 中文';
    syncDefaultStageAllCheckbox(state.status);
    updateCommitButtonsUI();
    renderLogs();
  }

  async function loadSettings() {
    const local = readLocalSettings();
    if (local && typeof local === 'object') {
      Object.assign(state.settings, {
        commitLang: local.commitLang === 'en' ? 'en' : 'zh',
        pullRebase: typeof local.pullRebase === 'boolean' ? local.pullRebase : state.settings.pullRebase,
        autoFetch: typeof local.autoFetch === 'boolean' ? local.autoFetch : state.settings.autoFetch,
        forceWithLease: typeof local.forceWithLease === 'boolean' ? local.forceWithLease : state.settings.forceWithLease,
        defaultStageAll: typeof local.defaultStageAll === 'boolean' ? local.defaultStageAll : state.settings.defaultStageAll,
      });
    }
    applySettingsToUI();

    try {
      const res = await Promise.race([
        sidecarFetch('/api/settings/get', {}),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
      ]);
      if (res.ok && res.data) {
        checkServerVersion(res.data.serverVersion);
        const { serverVersion: _v, ...rest } = res.data;
        state.settings = { ...state.settings, ...rest };
        writeLocalSettings(state.settings);
        applySettingsToUI();
      }
    } catch {
      // 老进程未重启或超时时静默使用本地缓存
    }
  }

  async function saveSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    if (Object.prototype.hasOwnProperty.call(patch, 'defaultStageAll')) {
      state.stageAllUserTouched = false;
    }
    writeLocalSettings(state.settings);
    applySettingsToUI();
    try {
      const res = await sidecarFetch('/api/settings/save', state.settings);
      if (res.ok && res.data) {
        const { serverVersion: _v, ...rest } = res.data;
        state.settings = { ...state.settings, ...rest };
        writeLocalSettings(state.settings);
      }
    } catch {
      // 忽略老进程未重启时的接口错误
    }
  }

  function syncDefaultStageAllCheckbox(st) {
    const checkbox = $('opt-stage-all');
    if (!checkbox || state.stageAllUserTouched) return;
    if (state.settings.defaultStageAll) {
      checkbox.checked = true;
    } else if (st) {
      checkbox.checked = st.staged.length === 0;
    } else {
      checkbox.checked = false;
    }
  }

  function updateCommitButtonsUI() {
    const msg = ($('commit-message')?.value || '').trim();
    const isAmend = Boolean($('opt-amend')?.checked);
    const useAi = !msg && !isAmend;

    const btnCommit = $('btn-commit');
    const labelPrimary = $('label-commit-primary');
    const labelSecondary = $('label-commit-secondary');
    const svg = btnCommit?.querySelector('svg');

    if (useAi) {
      btnCommit.className = 'btn btn-ai-primary';
      if (svg) svg.classList.remove('hidden');
      labelPrimary.textContent = 'AI 提交';
      labelSecondary.textContent = 'AI 提交并推送';
    } else {
      btnCommit.className = 'btn btn-primary';
      if (svg) svg.classList.add('hidden');
      labelPrimary.textContent = isAmend ? 'Amend 提交' : '提交';
      labelSecondary.textContent = isAmend ? 'Amend 并推送' : '提交并推送';
    }
  }

  function appendGitLogs(logs, route = '') {
    if (!Array.isArray(logs) || logs.length === 0) return;
    for (const item of logs) {
      if (!item || !item.command) continue;
      if (!item.ok) state.hasUnreadError = true;
      state.logs.unshift({
        time: new Date().toLocaleTimeString(),
        command: item.command,
        route,
        ok: Boolean(item.ok),
        durationMs: item.durationMs ?? 0,
        stdout: item.stdout || '',
        stderr: item.stderr || '',
        error: '',
      });
    }
    if (state.logs.length > 30) {
      state.logs.length = 30;
    }
    renderLogs();
  }

  function renderLogs() {
    const lang = getCurrentLang();
    $('log-count').textContent = String(state.logs.length);
    const dot = $('log-error-dot');
    if (dot) {
      dot.classList.toggle('hidden', !state.hasUnreadError);
    }

    const latest = state.logs[0];
    $('log-last-summary').textContent = latest
      ? formatLogEntry(latest, lang).lastSummaryText
      : (lang === 'en' ? 'Ready' : '就绪');

    const container = $('log-entries');
    container.innerHTML = '';
    for (const entry of state.logs) {
      const formatted = formatLogEntry(entry, lang);
      const div = document.createElement('div');
      div.className = `log-item ${entry.ok ? '' : 'err'}`;

      const head = document.createElement('div');
      head.className = 'log-item-head';

      const cmd = document.createElement('span');
      cmd.className = 'log-cmd';
      cmd.textContent = formatted.headText;
      head.appendChild(cmd);

      if (!entry.ok) {
        const fixBtn = document.createElement('button');
        fixBtn.className = 'link-btn';
        fixBtn.textContent = formatted.troubleshootLabel;
        const rawOut = [entry.stderr, entry.stdout, entry.error, entry.output]
          .filter(Boolean)
          .join('\n')
          .trim();
        fixBtn.onclick = () => {
          sendToAgent(
            `我在仓库 \`${state.activeRepo}\` 执行以下命令失败：\n\`\`\`\n${entry.command || entry.route}\n\`\`\`\n报错输出：\n\`\`\`\n${rawOut || '未知错误'}\n\`\`\`\n请帮我诊断原因并给出修复方案（如有安全修复步骤请协助处理）。`,
          );
        };
        head.appendChild(fixBtn);
      }

      div.appendChild(head);
      if (formatted.bodyText) {
        const pre = document.createElement('pre');
        pre.className = 'log-output';
        pre.textContent = formatted.bodyText;
        div.appendChild(pre);
      }
      container.appendChild(div);
    }
  }

  async function apiCall(route, payload = {}, { silent = false, recordLog = true } = {}) {
    const fullPayload = {
      workspaceUris: state.workspaceUris,
      conversationId: getConversationId(),
      repoPath: state.activeRepo,
      ...payload,
    };
    const res = await sidecarFetch(route, fullPayload);
    const resLogs = Array.isArray(res.logs) && res.logs.length > 0
      ? res.logs
      : (res.gitLog ? [res.gitLog] : []);

    if ((recordLog || !res.ok) && resLogs.length > 0) {
      appendGitLogs(resLogs, route);
    }

    if (!res.ok) {
      const lang = getCurrentLang();
      const failedLog = [...resLogs].reverse().find((l) => l && !l.ok) || resLogs[resLogs.length - 1];
      const failedCmd = failedLog?.command || '';
      const rawError = res.error || '';
      const formatted = formatErrorMessage(rawError, { lang, command: failedCmd, route });

      if (!silent) {
        state.hasUnreadError = true;
        showToast(formatted.summary, 'error');
        const hasFailedGitLog = resLogs.some((l) => l && !l.ok);
        if (!hasFailedGitLog) {
          state.logs.unshift({
            time: new Date().toLocaleTimeString(),
            command: '',
            route,
            ok: false,
            durationMs: 0,
            stdout: '',
            stderr: '',
            error: rawError || formatted.summary,
          });
          if (state.logs.length > 30) state.logs.length = 30;
        }
        renderLogs();
      }
      const err = new Error(formatted.summary);
      err.rawMessage = rawError;
      throw err;
    }
    return res.data;
  }

  function showConfirmModal({ title, body, code = '', confirmText = '确认', danger = false }) {
    return new Promise((resolve) => {
      $('modal-title').textContent = title;
      $('modal-body').textContent = body;
      const codeEl = $('modal-code');
      if (code) {
        codeEl.textContent = code;
        codeEl.classList.remove('hidden');
      } else {
        codeEl.classList.add('hidden');
      }
      const confirmBtn = $('modal-confirm');
      confirmBtn.textContent = confirmText;
      confirmBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

      const backdrop = $('modal-backdrop');
      backdrop.classList.remove('hidden');

      const cleanup = (result) => {
        backdrop.classList.add('hidden');
        $('modal-cancel').onclick = null;
        confirmBtn.onclick = null;
        resolve(result);
      };

      $('modal-cancel').onclick = () => cleanup(false);
      confirmBtn.onclick = () => cleanup(true);
    });
  }

  async function sendToAgent(prompt) {
    const convId = getConversationId();
    if (convId && window.sidecar?.agent?.sendMessage) {
      try {
        await window.sidecar.agent.sendMessage(prompt, convId);
        showToast('已委托给当前 Antigravity 对话中的 Agent', 'success');
        return;
      } catch (err) {
        const msg = getCurrentLang() === 'en'
          ? `Failed to send to Agent: ${err.message}`
          : `发送给 Agent 失败：${err.message}`;
        showToast(msg, 'error');
      }
    }

    try {
      await navigator.clipboard.writeText(prompt);
      showToast('当前视图未绑定对话，已将指令复制到剪贴板，请直接粘贴发送给 Agent', 'info');
    } catch {
      await showConfirmModal({
        title: '发送给 Agent 执行',
        body: '当前视图未绑定活跃对话，请复制下方指令到 Antigravity 对话框中执行：',
        code: prompt,
        confirmText: '关闭',
      });
    }
  }

  function extractUrisFromMetadata(metaRes) {
    const metaEvent =
      metaRes?.response?.conversationMetadata ||
      metaRes?.response?.conversation_metadata;
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

  async function fetchWorkspaceUrisFromMetadata() {
    const convId = getConversationId();
    if (!convId || !window.sidecar?.agent?.getConversationMetadata) return [];
    try {
      const metaRes = await window.sidecar.agent.getConversationMetadata(convId);
      return extractUrisFromMetadata(metaRes);
    } catch {
      return [];
    }
  }

  async function resolveWorkspaceUris() {
    if (window.sidecar?.getWorkspaceUris) {
      try {
        const uris = await Promise.race([
          window.sidecar.getWorkspaceUris(),
          new Promise((resolve) => setTimeout(() => resolve(null), 500)),
        ]);
        if (Array.isArray(uris) && uris.length > 0) {
          return uris;
        }
      } catch {
        // 忽略错误，进入 metadata 回退
      }
    }
    return fetchWorkspaceUrisFromMetadata();
  }

  function pathToFileUri(absPath) {
    const normalized = absPath.startsWith('/') ? absPath : `/${absPath}`;
    return `file://${normalized.split('/').map(encodeURIComponent).join('/')}`;
  }

  function openFileInAntigravity(relPath) {
    if (!state.activeRepo) return;
    const fullPath = `${state.activeRepo.replace(/\/+$/, '')}/${relPath}`;
    const uri = pathToFileUri(fullPath);
    if (window.sidecar?.ui?.toggleAuxPane) {
      window.sidecar.ui.toggleAuxPane({ tabType: 'fileView', uri });
    } else {
      showToast('当前宿主环境不支持打开原生文件标签', 'info');
    }
  }

  function splitDirAndName(relPath) {
    const idx = relPath.lastIndexOf('/');
    if (idx === -1) return { dir: '', name: relPath };
    return { dir: relPath.slice(0, idx), name: relPath.slice(idx + 1) };
  }

  function buildClientDraftMessage(stageAll) {
    const st = state.status;
    if (!st) return '';
    let targets = !stageAll && st.staged.length > 0
      ? st.staged
      : [...st.staged, ...st.unstaged, ...st.untracked];
    const seen = new Set();
    targets = targets.filter((i) => {
      if (seen.has(i.path)) return false;
      seen.add(i.path);
      return true;
    });
    if (targets.length === 0) return '';

    const names = targets.map((i) => splitDirAndName(i.path).name);
    const isEn = state.settings.commitLang === 'en';
    if (isEn) {
      return names.length === 1
        ? `feat: update ${names[0]}`
        : `feat: update ${names.length} files (${names.slice(0, 2).join(', ')}${names.length > 2 ? ', ...' : ''})`;
    }
    return names.length === 1
      ? `feat: 更新 ${names[0]}`
      : `feat: 更新 ${names.slice(0, 2).join('、')}${names.length > 2 ? ` 等 ${names.length} 个文件` : ''}`;
  }

  function buildAgentCommitPrompt({ stageAll, andPush }) {
    const st = state.status;
    const isEn = state.settings.commitLang === 'en';
    const langReq = isEn
      ? '请务必使用简洁规范的**英文** Conventional Commits 提交说明（如 `feat: ...`、`fix: ...`、`docs: ...`）'
      : '请务必使用简洁规范的**中文** Conventional Commits 提交说明（如 `feat: ...`、`fix: ...`、`docs: ...`）';
    const stageReq = stageAll
      ? '若工作区存在未暂存且安全的改动，请一并暂存后提交'
      : '若已有已暂存（staged）改动，仅针对已暂存改动生成提交说明并提交';
    const pushReq = andPush ? '，提交完成后立即推送到远端' : '';
    return `请针对仓库 \`${state.activeRepo}\`（当前分支：\`${st?.branch || ''}\`）检查 \`git status\` 与 \`git diff\`，排除敏感文件后，${langReq}，${stageReq}${pushReq}。`;
  }

  function getTargetCommitFiles(stageAll) {
    const st = state.status;
    if (!st) return [];
    if (!stageAll && st.staged.length > 0) return st.staged;
    const map = new Map();
    for (const item of [...st.staged, ...st.unstaged, ...st.untracked]) {
      if (!map.has(item.path)) map.set(item.path, item);
    }
    return Array.from(map.values());
  }

  async function confirmSensitiveFilesIfNeeded(stageAll) {
    const targets = getTargetCommitFiles(stageAll);
    const risky = targets.filter((f) => f.sensitive);
    if (risky.length === 0) return true;

    const listText = risky
      .map((f) => `${f.sensitiveReason === 'large' ? '[大文件 >10MB]' : '[疑似敏感文件]'} ${f.path}`)
      .join('\n');
    return showConfirmModal({
      title: '提交安全预警',
      body: '本次待提交清单中包含疑似敏感文件或超大文件（建议先取消暂存或加入 .gitignore）。确定仍要提交它们吗？',
      code: listText,
      confirmText: '仍要提交',
      danger: true,
    });
  }

  function computeStatusFingerprint(st) {
    if (!st) return '';
    const mapFiles = (arr) => (arr || []).map((f) => `${f.path}|${f.code}|${f.additions ?? ''}|${f.deletions ?? ''}|${f.sensitive ? 1 : 0}`).join(';');
    return [
      st.repoPath,
      st.branch,
      st.headOid,
      st.detached ? 1 : 0,
      st.upstream,
      st.ahead,
      st.behind,
      st.operationState || '',
      (st.remotes || []).map((r) => `${r.name}:${r.fetchUrl}`).join(','),
      mapFiles(st.staged),
      mapFiles(st.unstaged),
      mapFiles(st.untracked),
      mapFiles(st.conflicted),
    ].join('##');
  }

  function saveDiffScrollPositions(container) {
    const scrolls = new Map();
    if (!container) return scrolls;
    container.querySelectorAll('.diff-box[data-scroll-key]').forEach((el) => {
      scrolls.set(el.dataset.scrollKey, el.scrollTop);
    });
    return scrolls;
  }

  function restoreDiffScrollPositions(container, scrolls) {
    if (!container || scrolls.size === 0) return;
    container.querySelectorAll('.diff-box[data-scroll-key]').forEach((el) => {
      const top = scrolls.get(el.dataset.scrollKey);
      if (typeof top === 'number' && top > 0) {
        el.scrollTop = top;
      }
    });
  }

  function renderDiffContent(container, diffState) {
    container.innerHTML = '';
    if (diffState.loading) {
      const d = document.createElement('div');
      d.className = 'diff-empty';
      d.textContent = '正在加载差异…';
      container.appendChild(d);
      return;
    }
    if (diffState.error) {
      const d = document.createElement('div');
      d.className = 'diff-empty';
      d.textContent = `加载失败：${diffState.error}`;
      container.appendChild(d);
      return;
    }
    const data = diffState.data;
    if (!data || data.isBinary || !data.diff) {
      const d = document.createElement('div');
      d.className = 'diff-empty';
      d.textContent = data?.message || (data?.isBinary ? '二进制文件，无法预览文本差异' : '暂无可展示的文本差异');
      container.appendChild(d);
      return;
    }

    let oldLn = 0;
    let newLn = 0;

    for (const line of data.diff.split('\n')) {
      const row = document.createElement('div');
      row.className = 'diff-line';

      let lnLabel = '';
      if (
        line.startsWith('+++') ||
        line.startsWith('---') ||
        line.startsWith('diff ') ||
        line.startsWith('index ') ||
        line.startsWith('new file') ||
        line.startsWith('deleted file') ||
        line.startsWith('commit ') ||
        line.startsWith('Author:') ||
        line.startsWith('Date:')
      ) {
        row.classList.add('meta');
      } else if (line.startsWith('@@')) {
        row.classList.add('hunk');
        const m = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(line);
        if (m) {
          oldLn = parseInt(m[1], 10);
          newLn = parseInt(m[2], 10);
        }
      } else if (line.startsWith('+')) {
        row.classList.add('add');
        lnLabel = newLn > 0 ? String(newLn++) : '';
      } else if (line.startsWith('-')) {
        row.classList.add('del');
        lnLabel = oldLn > 0 ? String(oldLn++) : '';
      } else if (newLn > 0 && (line.startsWith(' ') || line === '')) {
        oldLn++;
        lnLabel = String(newLn++);
      }

      const lnSpan = document.createElement('span');
      lnSpan.className = 'diff-ln';
      lnSpan.textContent = lnLabel;

      const txtSpan = document.createElement('span');
      txtSpan.className = 'diff-txt';
      txtSpan.textContent = line || ' ';

      row.append(lnSpan, txtSpan);
      container.appendChild(row);
    }
  }

  async function toggleFileDiff(key, file, { staged = false, untracked = false } = {}) {
    if (state.expandedDiffs.has(key)) {
      state.expandedDiffs.delete(key);
      renderChanges();
      return;
    }
    state.expandedDiffs.set(key, { loading: true });
    renderChanges();
    try {
      const data = await apiCall('/api/diff', { file, staged, untracked }, { silent: true, recordLog: false });
      state.expandedDiffs.set(key, { loading: false, data });
    } catch (err) {
      state.expandedDiffs.set(key, { loading: false, error: err.message });
    }
    renderChanges();
  }

  function buildFileRow(item, kind) {
    const isStaged = kind === 'staged';
    const isUntracked = kind === 'untracked';
    const isConflicted = kind === 'conflicted';
    const key = `${kind}:${item.path}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'file-item';

    const row = document.createElement('div');
    row.className = 'file-row';

    const badge = document.createElement('span');
    const code = isUntracked ? 'U' : (isConflicted ? '!' : (item.code || 'M'));
    badge.className = `status-badge status-${isConflicted ? 'X' : code}`;
    badge.textContent = code;
    row.appendChild(badge);

    const pathWrap = document.createElement('div');
    pathWrap.className = 'file-path-wrap';
    const { dir, name } = splitDirAndName(item.path);
    const nameEl = document.createElement('span');
    nameEl.className = 'file-name';
    nameEl.textContent = item.origPath ? `${item.origPath} → ${name}` : name;
    pathWrap.appendChild(nameEl);
    if (dir) {
      const dirEl = document.createElement('span');
      dirEl.className = 'file-dir';
      dirEl.textContent = dir;
      pathWrap.appendChild(dirEl);
    }
    row.appendChild(pathWrap);

    if (item.sensitive) {
      const risk = document.createElement('span');
      risk.className = 'risk-tag';
      risk.textContent = item.sensitiveReason === 'large' ? '大文件' : '敏感';
      risk.title = item.sensitiveReason === 'large' ? '文件大于 10MB' : '疑似密钥或环境变量文件';
      row.appendChild(risk);
    }

    if (typeof item.additions === 'number' || typeof item.deletions === 'number') {
      const statEl = document.createElement('span');
      statEl.className = 'numstat';
      if (item.additions > 0) {
        const a = document.createElement('span');
        a.className = 'numstat-add';
        a.textContent = `+${item.additions}`;
        statEl.appendChild(a);
      }
      if (item.deletions > 0) {
        const d = document.createElement('span');
        d.className = 'numstat-del';
        d.textContent = `-${item.deletions}`;
        statEl.appendChild(d);
      }
      if (statEl.childNodes.length > 0) row.appendChild(statEl);
    }

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    if (isConflicted) {
      const mkConflictBtn = (label, strategy, tip) => {
        const btn = document.createElement('button');
        btn.className = 'mini-btn';
        btn.title = tip;
        btn.textContent = label;
        btn.onclick = (e) => {
          e.stopPropagation();
          runBusy(async () => {
            await apiCall('/api/conflict/resolve', { path: item.path, strategy });
            await refreshStatus();
            showToast(`已处理冲突: ${name}`, 'success');
          });
        };
        return btn;
      };
      actions.appendChild(mkConflictBtn('本地', 'ours', '采用本地当前版本 (--ours) 并标记已解决'));
      actions.appendChild(mkConflictBtn('远端', 'theirs', '采用传入版本 (--theirs) 并标记已解决'));
      actions.appendChild(mkConflictBtn('已解决', 'mark', '保留当前文件内容并暂存标记为已解决'));
    }

    const openBtn = document.createElement('button');
    openBtn.className = 'mini-btn';
    openBtn.title = '在 Antigravity 打开文件';
    openBtn.innerHTML = SVG_ICONS.open;
    openBtn.onclick = (e) => {
      e.stopPropagation();
      openFileInAntigravity(item.path);
    };
    actions.appendChild(openBtn);

    if (isStaged) {
      const unstageBtn = document.createElement('button');
      unstageBtn.className = 'mini-btn';
      unstageBtn.title = '取消暂存';
      unstageBtn.innerHTML = SVG_ICONS.minus;
      unstageBtn.onclick = async (e) => {
        e.stopPropagation();
        await runBusy(async () => {
          await apiCall('/api/unstage', { paths: [item.path] });
          await refreshStatus();
        });
      };
      actions.appendChild(unstageBtn);
    } else if (!isConflicted) {
      const stageBtn = document.createElement('button');
      stageBtn.className = 'mini-btn';
      stageBtn.title = '暂存';
      stageBtn.innerHTML = SVG_ICONS.plus;
      stageBtn.onclick = async (e) => {
        e.stopPropagation();
        await runBusy(async () => {
          await apiCall('/api/stage', { paths: [item.path] });
          await refreshStatus();
        });
      };
      actions.appendChild(stageBtn);

      const discardBtn = document.createElement('button');
      discardBtn.className = 'mini-btn danger';
      discardBtn.title = isUntracked ? '删除未跟踪文件' : '丢弃工作区修改';
      discardBtn.innerHTML = SVG_ICONS.discard;
      discardBtn.onclick = async (e) => {
        e.stopPropagation();
        const confirmed = await showConfirmModal({
          title: isUntracked ? '确认删除未跟踪文件' : '确认丢弃修改',
          body: isUntracked
            ? `确定要永久删除未跟踪文件 "${item.path}" 吗？此操作无法撤销。`
            : `确定要丢弃 "${item.path}" 在工作区的所有未暂存改动吗？此操作无法撤销。`,
          confirmText: isUntracked ? '删除文件' : '丢弃改动',
          danger: true,
        });
        if (!confirmed) return;
        await runBusy(async () => {
          await apiCall('/api/discard', { path: item.path, untracked: isUntracked });
          state.expandedDiffs.delete(key);
          await refreshStatus();
          showToast('已还原文件', 'success');
        });
      };
      actions.appendChild(discardBtn);
    }

    row.appendChild(actions);
    row.onclick = () => toggleFileDiff(key, item.path, { staged: isStaged, untracked: isUntracked });
    wrapper.appendChild(row);

    if (state.expandedDiffs.has(key)) {
      const diffBox = document.createElement('div');
      diffBox.className = 'diff-box';
      diffBox.dataset.scrollKey = key;
      renderDiffContent(diffBox, state.expandedDiffs.get(key));
      wrapper.appendChild(diffBox);
    }

    return wrapper;
  }

  function renderHeaderAndSyncBar() {
    const st = state.status;
    if (!st) {
      $('sync-bar').classList.add('hidden');
      return;
    }

    $('sync-bar').classList.remove('hidden');
    $('branch-name').textContent = st.detached ? `HEAD (${st.branch})` : (st.branch || 'main');

    const opBadge = $('op-badge');
    if (st.operationState) {
      opBadge.textContent = st.operationState.toUpperCase();
      opBadge.classList.remove('hidden');
    } else {
      opBadge.classList.add('hidden');
    }

    const pullBtn = $('btn-pull');
    const behindBadge = $('badge-behind');
    if (st.behind > 0) {
      behindBadge.textContent = `↓${st.behind}`;
      behindBadge.classList.remove('hidden');
      pullBtn.classList.add('btn-pull-highlight');
      pullBtn.title = `云端有 ${st.behind} 个较新提交，点击拉取更新`;
    } else {
      behindBadge.classList.add('hidden');
      pullBtn.classList.remove('btn-pull-highlight');
      pullBtn.title = '拉取远端更新';
    }

    const pushBtn = $('btn-push');
    const aheadBadge = $('badge-ahead');
    if (st.ahead > 0) {
      aheadBadge.textContent = `↑${st.ahead}`;
      aheadBadge.classList.remove('hidden');
      pushBtn.classList.add('btn-push-active');
    } else {
      aheadBadge.classList.add('hidden');
      pushBtn.classList.remove('btn-push-active');
    }

    $('label-push').textContent = st.upstream ? '推送' : '发布分支';
    const hasRemote = st.remotes && st.remotes.length > 0;
    pullBtn.disabled = !hasRemote || !st.upstream || state.busy;
    pushBtn.disabled = !hasRemote || !st.hasCommits || st.detached || state.busy;
    $('btn-sync').disabled = !hasRemote || state.busy;
  }

  function renderOperationBanner(st) {
    const banner = $('operation-banner');
    const hasConflicts = st.conflicted.length > 0;
    const op = st.operationState;

    if (!op && !hasConflicts) {
      banner.classList.add('hidden');
      return;
    }

    banner.classList.remove('hidden');
    banner.classList.toggle('danger', hasConflicts);

    $('operation-title').textContent = op ? (OP_LABELS[op] || `${op} 进行中`) : '检测到合并冲突';
    $('operation-summary').textContent = hasConflicts
      ? `共有 ${st.conflicted.length} 个冲突文件等待处理`
      : '冲突已处理完毕，可点击“继续”完成流程';

    $('btn-op-continue').classList.toggle('hidden', !op || hasConflicts);
    $('btn-op-skip').classList.toggle('hidden', !op || op === 'merging');
    $('btn-op-abort').classList.toggle('hidden', !op);
    $('btn-agent-conflicts').classList.toggle('hidden', !hasConflicts);
  }

  function renderChanges() {
    const st = state.status;
    if (!st) return;

    const scrolls = saveDiffScrollPositions($('tab-changes'));

    const badge = $('tab-changes-count');
    if (st.totalChanges > 0) {
      badge.textContent = String(st.totalChanges);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }

    renderOperationBanner(st);

    // 变更数 >= 5 或已有过滤词时显现搜索框
    const showFilter = st.totalChanges >= 5 || Boolean(state.changesQuery);
    $('changes-filter-wrap').classList.toggle('hidden', !showFilter);
    const q = state.changesQuery.trim().toLowerCase();
    const matchFilter = (item) => !q || item.path.toLowerCase().includes(q);

    const groupConflicted = $('group-conflicted');
    const filteredConflicted = st.conflicted.filter(matchFilter);
    if (st.conflicted.length > 0) {
      groupConflicted.classList.remove('hidden');
      $('count-conflicted').textContent = String(filteredConflicted.length);
      const listConflicted = $('list-conflicted');
      listConflicted.innerHTML = '';
      for (const item of filteredConflicted) {
        listConflicted.appendChild(buildFileRow(item, 'conflicted'));
      }
    } else {
      groupConflicted.classList.add('hidden');
    }

    const filteredStaged = st.staged.filter(matchFilter);
    $('count-staged').textContent = String(filteredStaged.length);
    const listStaged = $('list-staged');
    listStaged.innerHTML = '';
    for (const item of filteredStaged) {
      listStaged.appendChild(buildFileRow(item, 'staged'));
    }
    $('btn-unstage-all').classList.toggle('hidden', st.staged.length === 0);

    const unstagedAll = [
      ...st.unstaged.map((u) => ({ ...u, _kind: 'unstaged' })),
      ...st.untracked.map((u) => ({ ...u, _kind: 'untracked' })),
    ];
    const filteredUnstaged = unstagedAll.filter(matchFilter);
    $('count-unstaged').textContent = String(filteredUnstaged.length);
    const listUnstaged = $('list-unstaged');
    listUnstaged.innerHTML = '';
    for (const item of filteredUnstaged) {
      listUnstaged.appendChild(buildFileRow(item, item._kind));
    }
    $('btn-stage-all').classList.toggle('hidden', unstagedAll.length === 0);
    $('btn-discard-all').classList.toggle('hidden', unstagedAll.length === 0);

    $('clean-tree-hint').classList.toggle('hidden', st.totalChanges > 0);
    restoreDiffScrollPositions($('tab-changes'), scrolls);
  }

  function renderBranches() {
    const br = state.branches;
    if (!br) return;

    $('count-local-branches').textContent = String(br.local.length);
    const localList = $('list-local-branches');
    localList.innerHTML = '';
    for (const b of br.local) {
      const row = document.createElement('div');
      row.className = 'list-row';

      const main = document.createElement('div');
      main.className = 'list-main';

      const titleRow = document.createElement('div');
      titleRow.className = 'list-title-row';

      const title = document.createElement('span');
      title.className = 'list-title';
      title.textContent = b.name;
      titleRow.appendChild(title);

      if (b.current) {
        const curTag = document.createElement('span');
        curTag.className = 'tag-pill current';
        curTag.textContent = '当前';
        titleRow.appendChild(curTag);
      }
      if (b.track) {
        const trackTag = document.createElement('span');
        trackTag.className = 'tag-pill';
        trackTag.textContent = b.track;
        titleRow.appendChild(trackTag);
      }
      main.appendChild(titleRow);

      const sub = document.createElement('span');
      sub.className = 'list-sub';
      sub.textContent = `${b.hash}${b.upstream ? ` → ${b.upstream}` : ''} · ${b.subject}`;
      main.appendChild(sub);
      row.appendChild(main);

      const actions = document.createElement('div');
      actions.className = 'row-actions';
      if (!b.current) {
        const swBtn = document.createElement('button');
        swBtn.className = 'btn btn-sm';
        swBtn.textContent = '切换';
        swBtn.onclick = () => runBusy(async () => {
          await apiCall('/api/checkout', { target: b.name, isRemote: false });
          await refreshAll();
          showToast(`已切换到 ${b.name}`, 'success');
        });
        actions.appendChild(swBtn);

        const mergeBtn = document.createElement('button');
        mergeBtn.className = 'mini-btn';
        mergeBtn.title = `合并 ${b.name} 到当前分支`;
        mergeBtn.textContent = '合并';
        mergeBtn.onclick = async () => {
          const ok = await showConfirmModal({
            title: '合并分支',
            body: `确定要将分支 "${b.name}" 合并到当前分支吗？`,
            confirmText: '执行合并',
          });
          if (!ok) return;
          await runBusy(async () => {
            await apiCall('/api/branch/merge', { name: b.name });
            await refreshAll();
            showToast(`已合并 ${b.name}`, 'success');
          });
        };
        actions.appendChild(mergeBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'mini-btn danger';
        delBtn.title = `删除本地分支 ${b.name}`;
        delBtn.textContent = '删';
        delBtn.onclick = async () => {
          const ok = await showConfirmModal({
            title: '删除本地分支',
            body: `确定要删除分支 "${b.name}" 吗？（优先尝试安全删除 git branch -d）`,
            confirmText: '删除分支',
            danger: true,
          });
          if (!ok) return;
          await runBusy(async () => {
            try {
              await apiCall('/api/branch/delete', { name: b.name, force: false }, { silent: true });
              await refreshBranches();
              showToast(`已删除分支 ${b.name}`, 'success');
            } catch (err) {
              const rawMsg = err?.rawMessage || err?.message || '';
              if (/not fully merged|未完全合并|尚未完全 Merge/i.test(rawMsg)) {
                const forceOk = await showConfirmModal({
                  title: '分支尚未合并，是否强制删除？',
                  body: `分支 "${b.name}" 包含尚未合并到当前分支的提交。确定要使用 git branch -D 强制删除吗？此操作可能导致孤立提交丢失。`,
                  confirmText: '强制删除 (-D)',
                  danger: true,
                });
                if (!forceOk) return;
                await apiCall('/api/branch/delete', { name: b.name, force: true });
                await refreshBranches();
                showToast(`已强制删除分支 ${b.name}`, 'success');
              } else {
                const fallback = getCurrentLang() === 'en' ? 'Failed to delete Branch' : '删除 Branch 失败';
                showToast(err?.message || fallback, 'error');
              }
            }
          });
        };
        actions.appendChild(delBtn);
      }
      row.appendChild(actions);
      localList.appendChild(row);
    }

    $('count-remote-branches').textContent = String(br.remote.length);
    const remoteList = $('list-remote-branches');
    remoteList.innerHTML = '';
    for (const r of br.remote) {
      const row = document.createElement('div');
      row.className = 'list-row';

      const main = document.createElement('div');
      main.className = 'list-main';
      const title = document.createElement('span');
      title.className = 'list-title';
      title.textContent = r.name;
      const sub = document.createElement('span');
      sub.className = 'list-sub';
      sub.textContent = `${r.hash} · ${r.subject}`;
      main.append(title, sub);
      row.appendChild(main);

      const trackBtn = document.createElement('button');
      trackBtn.className = 'btn btn-sm';
      trackBtn.textContent = '跟踪检出';
      trackBtn.onclick = () => runBusy(async () => {
        await apiCall('/api/checkout', { target: r.name, isRemote: true });
        await refreshAll();
        showToast(`已检出 ${r.name}`, 'success');
      });
      row.appendChild(trackBtn);
      remoteList.appendChild(row);
    }

    $('count-worktrees').textContent = String(br.worktrees.length);
    const wtList = $('list-worktrees');
    wtList.innerHTML = '';
    for (const wt of br.worktrees) {
      const row = document.createElement('div');
      row.className = 'list-row';
      const main = document.createElement('div');
      main.className = 'list-main';
      const title = document.createElement('span');
      title.className = 'list-title';
      title.textContent = wt.detached ? `HEAD (${wt.head.slice(0, 7)})` : (wt.branch || '未知分支');
      const sub = document.createElement('span');
      sub.className = 'list-sub mono';
      sub.textContent = wt.path;
      main.append(title, sub);
      row.appendChild(main);
      wtList.appendChild(row);
    }
  }

  function renderStashes() {
    const list = state.stashes?.stashes || [];
    $('count-stashes').textContent = String(list.length);
    const badge = $('tab-stash-count');
    if (list.length > 0) {
      badge.textContent = String(list.length);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }

    const container = $('list-stashes');
    container.innerHTML = '';
    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'diff-empty';
      empty.textContent = '暂无 Stash 贮藏记录';
      container.appendChild(empty);
      return;
    }

    for (const s of list) {
      const item = document.createElement('div');
      item.className = 'file-item';

      const row = document.createElement('div');
      row.className = 'list-row clickable';
      const main = document.createElement('div');
      main.className = 'list-main';

      const title = document.createElement('span');
      title.className = 'list-title';
      title.textContent = s.message || s.ref;
      const sub = document.createElement('span');
      sub.className = 'list-sub';
      sub.textContent = `${s.ref} · ${s.hash} · ${s.relDate}`;
      main.append(title, sub);
      row.appendChild(main);

      const actions = document.createElement('div');
      actions.className = 'row-actions';

      const applyBtn = document.createElement('button');
      applyBtn.className = 'mini-btn';
      applyBtn.textContent = 'Apply';
      applyBtn.onclick = (e) => {
        e.stopPropagation();
        runBusy(async () => {
          await apiCall('/api/stash/apply', { ref: s.ref });
          await refreshAll();
          showToast(`已应用 ${s.ref}`, 'success');
        });
      };

      const popBtn = document.createElement('button');
      popBtn.className = 'mini-btn';
      popBtn.textContent = 'Pop';
      popBtn.onclick = (e) => {
        e.stopPropagation();
        runBusy(async () => {
          await apiCall('/api/stash/pop', { ref: s.ref });
          await refreshAll();
          showToast(`已弹出 ${s.ref}`, 'success');
        });
      };

      const dropBtn = document.createElement('button');
      dropBtn.className = 'mini-btn danger';
      dropBtn.textContent = 'Drop';
      dropBtn.onclick = async (e) => {
        e.stopPropagation();
        const ok = await showConfirmModal({
          title: '删除 Stash 记录',
          body: `确定要丢弃 "${s.ref}" (${s.message}) 吗？`,
          confirmText: '删除',
          danger: true,
        });
        if (!ok) return;
        await runBusy(async () => {
          await apiCall('/api/stash/drop', { ref: s.ref });
          state.expandedStashes.delete(s.ref);
          await refreshStashes();
          showToast(`已删除 ${s.ref}`, 'success');
        });
      };

      actions.append(applyBtn, popBtn, dropBtn);
      row.appendChild(actions);

      row.onclick = async () => {
        if (state.expandedStashes.has(s.ref)) {
          state.expandedStashes.delete(s.ref);
          renderStashes();
          return;
        }
        state.expandedStashes.set(s.ref, { loading: true });
        renderStashes();
        try {
          const data = await apiCall('/api/stash/detail', { ref: s.ref }, { silent: true, recordLog: false });
          state.expandedStashes.set(s.ref, { loading: false, data: { diff: data.detail } });
        } catch (err) {
          state.expandedStashes.set(s.ref, { loading: false, error: err.message });
        }
        renderStashes();
      };

      item.appendChild(row);

      if (state.expandedStashes.has(s.ref)) {
        const box = document.createElement('div');
        box.className = 'diff-box';
        renderDiffContent(box, state.expandedStashes.get(s.ref));
        item.appendChild(box);
      }

      container.appendChild(item);
    }
  }

  function renderHistory() {
    const commits = state.history?.commits || [];
    const container = $('list-history');
    container.innerHTML = '';

    $('history-more-wrap').classList.toggle('hidden', !state.history?.hasMore);

    if (commits.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'diff-empty';
      empty.textContent = state.historyQuery ? '未找到匹配的提交记录' : '当前分支尚无提交历史';
      container.appendChild(empty);
      return;
    }

    for (const c of commits) {
      const item = document.createElement('div');
      item.className = 'file-item';

      const row = document.createElement('div');
      row.className = 'list-row clickable';

      const main = document.createElement('div');
      main.className = 'list-main';

      const titleRow = document.createElement('div');
      titleRow.className = 'list-title-row';

      const dot = document.createElement('span');
      dot.className = c.refs.some((r) => r.includes('HEAD')) ? 'timeline-dot head' : 'timeline-dot';
      titleRow.appendChild(dot);

      const hashTag = document.createElement('span');
      hashTag.className = 'tag-pill mono';
      hashTag.textContent = c.shortHash;
      titleRow.appendChild(hashTag);

      for (const r of c.refs) {
        const refTag = document.createElement('span');
        refTag.className = r.includes('HEAD') ? 'tag-pill current' : 'tag-pill';
        refTag.textContent = r;
        titleRow.appendChild(refTag);
      }

      const title = document.createElement('span');
      title.className = 'list-title';
      title.textContent = c.subject;
      titleRow.appendChild(title);
      main.appendChild(titleRow);

      const sub = document.createElement('span');
      sub.className = 'list-sub';
      sub.textContent = `${c.author} · ${c.relDate}`;
      main.appendChild(sub);
      row.appendChild(main);

      const actions = document.createElement('div');
      actions.className = 'row-actions';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'mini-btn';
      copyBtn.title = '复制完整 Hash';
      copyBtn.textContent = '复制';
      copyBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(c.hash);
          showToast(`已复制 ${c.shortHash}`, 'success');
        } catch {
          showToast(c.hash, 'info');
        }
      };

      const revertBtn = document.createElement('button');
      revertBtn.className = 'mini-btn';
      revertBtn.title = '生成 Revert 反向提交';
      revertBtn.textContent = 'Revert';
      revertBtn.onclick = async (e) => {
        e.stopPropagation();
        const ok = await showConfirmModal({
          title: '确认 Revert 提交',
          body: `确定要为提交 ${c.shortHash}（${c.subject}）生成一个反向提交吗？`,
          confirmText: '执行 Revert',
        });
        if (!ok) return;
        await runBusy(async () => {
          await apiCall('/api/revert', { hash: c.hash });
          await refreshAll();
          showToast(`已 Revert ${c.shortHash}`, 'success');
        });
      };

      actions.append(copyBtn, revertBtn);
      row.appendChild(actions);

      row.onclick = async () => {
        if (state.expandedCommits.has(c.hash)) {
          state.expandedCommits.delete(c.hash);
          renderHistory();
          return;
        }
        state.expandedCommits.set(c.hash, { loading: true });
        renderHistory();
        try {
          const data = await apiCall('/api/commit-detail', { hash: c.hash }, { silent: true, recordLog: false });
          state.expandedCommits.set(c.hash, { loading: false, data: { diff: data.detail } });
        } catch (err) {
          state.expandedCommits.set(c.hash, { loading: false, error: err.message });
        }
        renderHistory();
      };

      item.appendChild(row);

      if (state.expandedCommits.has(c.hash)) {
        const box = document.createElement('div');
        box.className = 'diff-box';
        renderDiffContent(box, state.expandedCommits.get(c.hash));
        item.appendChild(box);
      }

      container.appendChild(item);
    }
  }

  function renderRepoSelector() {
    const select = $('repo-select');
    const single = $('repo-single-label');
    const gitRepos = state.repos.filter((r) => r.isGitRepo);

    select.innerHTML = '';
    for (const r of state.repos) {
      const opt = document.createElement('option');
      opt.value = r.path;
      opt.textContent = r.isGitRepo ? `${r.name} (${r.path})` : `${r.name} [未初始化]`;
      select.appendChild(opt);
    }
    select.value = state.activeRepo;

    if (state.repos.length <= 1) {
      select.classList.add('hidden');
      single.classList.remove('hidden');
      const activeObj = state.repos.find((r) => r.path === state.activeRepo);
      single.textContent = activeObj ? activeObj.name : '未检测到工作区';
    } else {
      select.classList.remove('hidden');
      single.classList.add('hidden');
    }

    const activeEntry = state.repos.find((r) => r.path === state.activeRepo);
    if (!activeEntry) {
      $('empty-state').classList.remove('hidden');
      $('workspace-main').classList.add('hidden');
      $('sync-bar').classList.add('hidden');
      $('empty-title').textContent = '未检测到工作区目录';
      $('empty-desc').textContent = '请先在 Antigravity 中打开包含项目文件夹的对话，或点击右上角刷新按钮重试。';
      $('empty-actions').classList.add('hidden');
      return false;
    }

    if (!activeEntry.isGitRepo || gitRepos.length === 0) {
      $('empty-state').classList.remove('hidden');
      $('workspace-main').classList.add('hidden');
      $('sync-bar').classList.add('hidden');
      $('empty-title').textContent = '当前目录尚不是 Git 仓库';
      $('empty-desc').textContent = `目录：${activeEntry.path}`;
      $('empty-actions').classList.remove('hidden');
      return false;
    }

    $('empty-state').classList.add('hidden');
    $('workspace-main').classList.remove('hidden');
    return true;
  }

  async function refreshStatus({ silent = false, forceRender = false } = {}) {
    if (!state.activeRepo) return;
    const activeEntry = state.repos.find((r) => r.path === state.activeRepo);
    if (!activeEntry?.isGitRepo) return;

    const nextStatus = await apiCall('/api/status', {}, { silent, recordLog: false });
    const nextFp = computeStatusFingerprint(nextStatus);
    if (silent && !forceRender && nextFp === state.statusFingerprint) {
      return;
    }

    state.status = nextStatus;
    state.statusFingerprint = nextFp;
    syncDefaultStageAllCheckbox(nextStatus);
    renderHeaderAndSyncBar();
    renderChanges();
  }

  async function refreshBranches({ silent = false } = {}) {
    if (!state.activeRepo) return;
    state.branches = await apiCall('/api/branches', {}, { silent, recordLog: false });
    renderBranches();
  }

  async function refreshStashes({ silent = false } = {}) {
    if (!state.activeRepo) return;
    state.stashes = await apiCall('/api/stashes', {}, { silent, recordLog: false });
    renderStashes();
  }

  async function refreshHistory({ silent = false, append = false } = {}) {
    if (!state.activeRepo) return;
    const skip = append ? (state.history?.commits?.length || 0) : 0;
    const res = await apiCall(
      '/api/log',
      { limit: HISTORY_PAGE_SIZE, skip, query: state.historyQuery },
      { silent, recordLog: false },
    );
    if (append && state.history) {
      state.history = {
        commits: [...state.history.commits, ...res.commits],
        hasMore: Boolean(res.hasMore),
      };
    } else {
      state.history = res;
    }
    renderHistory();
  }

  async function refreshActiveTab() {
    if (state.activeTab === 'branches') await refreshBranches();
    else if (state.activeTab === 'stash') await refreshStashes();
    else if (state.activeTab === 'history') await refreshHistory();
  }

  async function maybeAutoFetch({ force = false } = {}) {
    if (!state.settings.autoFetch && !force) return;
    if (!state.activeRepo || state.busy || state.autoFetchInFlight) return;
    const st = state.status;
    if (!st || !st.remotes || st.remotes.length === 0) return;
    if (!force && Date.now() - state.lastFetchAt < AUTO_FETCH_INTERVAL_MS) return;

    state.autoFetchInFlight = true;
    try {
      await apiCall('/api/fetch', { prune: true }, { silent: true, recordLog: force });
      state.lastFetchAt = Date.now();
      await refreshStatus({ silent: true });
    } catch {
      // 后台自动检测失败不打扰用户
    } finally {
      state.autoFetchInFlight = false;
    }
  }

  async function refreshAll({ checkRemote = false } = {}) {
    const isGit = renderRepoSelector();
    if (!isGit) return;
    await refreshStatus({ forceRender: true });
    await Promise.all([
      refreshActiveTab(),
      state.activeTab === 'stash' ? Promise.resolve() : refreshStashes({ silent: true }),
    ]);
    if (checkRemote) {
      await maybeAutoFetch({ force: true });
    } else if (state.lastFetchAt === 0) {
      setTimeout(() => {
        maybeAutoFetch({ force: false }).catch(() => {});
      }, 1200);
    }
  }

  async function loadReposFromWorkspace(uris, { checkRemote = false } = {}) {
    state.workspaceUris = Array.isArray(uris) ? uris : [];
    const convId = getConversationId();

    if (state.workspaceUris.length === 0 && !convId) {
      state.repos = [];
      state.activeRepo = '';
      state.status = null;
      state.statusFingerprint = '';
      renderRepoSelector();
      return;
    }

    const res = await sidecarFetch('/api/repos', {
      workspaceUris: state.workspaceUris,
      conversationId: convId,
    });
    if (!res.ok) {
      const lang = getCurrentLang();
      const formatted = formatErrorMessage(res.error || '', { lang, route: '/api/repos' });
      showToast(formatted.summary, 'error');
      reportFatalError(
        lang === 'en' ? 'Failed to scan Git repositories' : '扫描 Git 仓库失败',
        res.error || (lang === 'en' ? 'Unknown error' : '未知错误'),
      );
      return;
    }

    checkServerVersion(res.data?.serverVersion);

    if (Array.isArray(res.data?.workspaceUris) && res.data.workspaceUris.length > 0) {
      state.workspaceUris = res.data.workspaceUris;
    }

    state.repos = res.data?.repos || [];
    if (!state.repos.some((r) => r.path === state.activeRepo)) {
      state.activeRepo = state.repos[0]?.path || '';
      state.stageAllUserTouched = false;
      state.expandedDiffs.clear();
      state.expandedStashes.clear();
      state.expandedCommits.clear();
      state.lastFetchAt = 0;
    }
    await refreshAll({ checkRemote });
  }

  async function runBusy(fn) {
    if (state.busy) return;
    state.busy = true;
    renderHeaderAndSyncBar();
    try {
      await fn();
    } catch {
      // 错误已由 apiCall 统一提示
    } finally {
      state.busy = false;
      renderHeaderAndSyncBar();
    }
  }

  function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('hidden', panel.id !== `tab-${tabName}`);
      panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });
    refreshActiveTab().catch(() => {});
  }

  function bindEvents() {
    $('repo-select').onchange = async (e) => {
      state.activeRepo = e.target.value;
      state.stageAllUserTouched = false;
      state.statusFingerprint = '';
      state.expandedDiffs.clear();
      state.expandedStashes.clear();
      state.expandedCommits.clear();
      state.lastFetchAt = 0;
      await refreshAll();
    };

    $('btn-dismiss-update').onclick = () => {
      state.updateBannerDismissed = true;
      $('server-update-banner').classList.add('hidden');
    };

    $('btn-refresh').onclick = () => {
      const btn = $('btn-refresh');
      btn.classList.add('spinning');
      runBusy(async () => {
        let uris = state.workspaceUris;
        if (!uris || uris.length === 0) {
          uris = await resolveWorkspaceUris();
        }
        await loadReposFromWorkspace(uris, { checkRemote: true });
      }).finally(() => {
        btn.classList.remove('spinning');
      });
    };

    const toggleLogDrawer = () => {
      const drawer = $('log-drawer');
      drawer.classList.toggle('collapsed');
      if (!drawer.classList.contains('collapsed')) {
        state.hasUnreadError = false;
        renderLogs();
      }
    };
    $('btn-toggle-log').onclick = toggleLogDrawer;
    $('log-drawer-toggle').onclick = toggleLogDrawer;

    $('btn-branch-pill').onclick = () => switchTab('branches');

    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.onclick = () => switchTab(btn.dataset.tab);
    });

    // 右上角设置弹窗控制
    $('btn-settings').onclick = (e) => {
      e.stopPropagation();
      $('settings-popover').classList.toggle('hidden');
    };
    document.addEventListener('click', (e) => {
      if (!$('settings-popover').contains(e.target) && !$('btn-settings').contains(e.target)) {
        $('settings-popover').classList.add('hidden');
      }
    });

    document.querySelectorAll('.seg-btn[data-lang]').forEach((btn) => {
      btn.onclick = () => {
        const lang = btn.dataset.lang === 'en' ? 'en' : 'zh';
        saveSettings({ commitLang: lang });
        showToast(
          lang === 'en'
            ? 'Language switched to English (AI commit, alerts & activity log)'
            : '语言已切换为中文（AI 说明、报警提示与活动日志）',
          'success',
        );
      };
    });

    $('commit-lang-pill').onclick = () => {
      const next = state.settings.commitLang === 'en' ? 'zh' : 'en';
      saveSettings({ commitLang: next });
      showToast(
        next === 'en'
          ? 'Language: English (AI commit, alerts & activity log)'
          : '语言：中文（AI 说明、报警提示与活动日志）',
        'info',
      );
    };

    $('opt-default-stage-all').onchange = (e) => saveSettings({ defaultStageAll: e.target.checked });
    $('opt-pull-rebase').onchange = (e) => saveSettings({ pullRebase: e.target.checked });
    $('opt-auto-fetch').onchange = (e) => saveSettings({ autoFetch: e.target.checked });

    $('opt-force-lease').onchange = async (e) => {
      if (e.target.checked) {
        const ok = await showConfirmModal({
          title: '开启安全强推选项',
          body: '开启后，“推送”按钮将附加 --force-with-lease 参数（通常用于 Amend 或 Rebase 后安全覆盖自己分支的远端历史）。确定开启吗？',
          confirmText: '确认开启',
          danger: true,
        });
        if (!ok) {
          e.target.checked = false;
          return;
        }
      }
      saveSettings({ forceWithLease: e.target.checked });
    };

    $('btn-init-repo').onclick = () => runBusy(async () => {
      await apiCall('/api/init');
      showToast('已初始化 Git 仓库', 'success');
      await loadReposFromWorkspace(state.workspaceUris);
    });

    $('btn-stage-all').onclick = () => runBusy(async () => {
      await apiCall('/api/stage-all');
      state.stageAllUserTouched = false;
      await refreshStatus();
    });
    $('btn-unstage-all').onclick = () => runBusy(async () => {
      await apiCall('/api/unstage-all');
      state.stageAllUserTouched = false;
      await refreshStatus();
    });

    $('btn-discard-all').onclick = async () => {
      const ok = await showConfirmModal({
        title: '确认丢弃全部未暂存更改',
        body: '将还原所有已跟踪文件的未暂存修改，并永久删除所有未跟踪文件。此操作无法撤销！',
        confirmText: '全部丢弃',
        danger: true,
      });
      if (!ok) return;
      await runBusy(async () => {
        await apiCall('/api/discard-all');
        state.expandedDiffs.clear();
        await refreshStatus();
        showToast('已丢弃工作区未暂存更改', 'success');
      });
    };

    $('changes-filter').addEventListener('input', (e) => {
      state.changesQuery = e.target.value || '';
      renderChanges();
    });

    $('opt-stage-all').addEventListener('change', () => {
      state.stageAllUserTouched = true;
    });

    $('commit-message').addEventListener('input', updateCommitButtonsUI);
    $('opt-amend').addEventListener('change', updateCommitButtonsUI);

    // 调用后端真 LLM 生成说明并填入输入框
    $('btn-ai-draft').onclick = async () => {
      const st = state.status;
      if (!st || st.totalChanges === 0) {
        showToast('当前没有待提交的改动', 'info');
        return;
      }
      const btn = $('btn-ai-draft');
      const label = $('label-ai-draft');
      const stageAll = $('opt-stage-all').checked;
      btn.disabled = true;
      label.textContent = 'AI 生成中…';

      let draft = '';
      let source = 'heuristic';
      try {
        const data = await apiCall(
          '/api/suggest-message',
          { stageAll, lang: state.settings.commitLang },
          { silent: true, recordLog: false },
        );
        draft = data?.message || '';
        source = data?.source || 'heuristic';
      } catch {
        draft = buildClientDraftMessage(stageAll);
      } finally {
        btn.disabled = false;
        label.textContent = 'AI 生成说明';
      }

      if (!draft) {
        showToast('未检测到可供生成说明的变更文件', 'info');
        return;
      }
      const input = $('commit-message');
      input.value = draft;
      updateCommitButtonsUI();
      input.focus();
      input.select();
      showToast(source === 'llm' ? '✨ 已由 AI 生成提交说明' : '已生成提交说明草稿', 'success');
    };

    const doCommit = async ({ andPush = false } = {}) => {
      const message = $('commit-message').value;
      const stageAll = $('opt-stage-all').checked;
      const amend = $('opt-amend').checked;

      if (!state.status || (state.status.totalChanges === 0 && !amend)) {
        showToast('当前工作区没有可提交的更改', 'info');
        return;
      }

      const safeProceed = await confirmSensitiveFilesIfNeeded(stageAll);
      if (!safeProceed) return;

      // 提交说明为空且非 Amend：优先通过侧边栏静默 LLM 摘要并自动提交，失败时回退委托对话 Agent
      if (!message.trim() && !amend) {
        await runBusy(async () => {
          const btnCommit = $('btn-commit');
          const btnPush = $('btn-commit-push');
          const origPrimary = $('label-commit-primary').textContent;
          const origSecondary = $('label-commit-secondary').textContent;
          btnCommit.disabled = true;
          btnPush.disabled = true;
          $('label-commit-primary').textContent = 'AI 生成中…';

          try {
            let aiMsg = '';
            let source = 'heuristic';
            try {
              const suggest = await apiCall(
                '/api/suggest-message',
                { stageAll, lang: state.settings.commitLang },
                { silent: true, recordLog: false },
              );
              aiMsg = suggest?.message || '';
              source = suggest?.source || 'heuristic';
            } catch {
              aiMsg = '';
            }

            if (aiMsg && source === 'llm') {
              $('label-commit-primary').textContent = '提交中…';
              await apiCall('/api/commit', { message: aiMsg, stageAll, amend: false });
              state.stageAllUserTouched = false;
              state.expandedDiffs.clear();
              if (andPush) {
                await apiCall('/api/push', {
                  forceWithLease: state.settings.forceWithLease,
                  setUpstream: true,
                });
                showToast(`✨ AI 已提交并推送：${aiMsg.split('\n')[0]}`, 'success');
              } else {
                showToast(`✨ AI 已提交：${aiMsg.split('\n')[0]}`, 'success');
              }
              await refreshAll();
              return;
            }

            // 后端尚不支持 LLM 或临时不可用时，回退委托当前对话 Agent
            await sendToAgent(buildAgentCommitPrompt({ stageAll, andPush }));
          } finally {
            btnCommit.disabled = false;
            btnPush.disabled = false;
            $('label-commit-primary').textContent = origPrimary;
            $('label-commit-secondary').textContent = origSecondary;
            updateCommitButtonsUI();
          }
        });
        return;
      }

      await runBusy(async () => {
        await apiCall('/api/commit', { message, stageAll, amend });
        $('commit-message').value = '';
        $('opt-amend').checked = false;
        state.stageAllUserTouched = false;
        updateCommitButtonsUI();
        state.expandedDiffs.clear();
        if (andPush) {
          await apiCall('/api/push', {
            forceWithLease: state.settings.forceWithLease,
            setUpstream: true,
          });
          showToast('已提交并推送', 'success');
        } else {
          showToast('提交成功', 'success');
        }
        await refreshAll();
      });
    };

    $('btn-commit').onclick = () => doCommit({ andPush: false });
    $('btn-commit-push').onclick = () => doCommit({ andPush: true });
    $('commit-message').addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        doCommit({ andPush: false });
      }
    });

    // Merge / Rebase 流程控制按钮
    $('btn-op-continue').onclick = () => runBusy(async () => {
      await apiCall('/api/operation/continue');
      await refreshAll();
      showToast('已继续并完成流程', 'success');
    });

    $('btn-op-skip').onclick = () => runBusy(async () => {
      await apiCall('/api/operation/skip');
      await refreshAll();
      showToast('已跳过当前提交', 'success');
    });

    $('btn-op-abort').onclick = async () => {
      const ok = await showConfirmModal({
        title: '确认中止当前流程',
        body: `确定要中止正在进行的 ${state.status?.operationState || ''} 并恢复到操作前状态吗？`,
        confirmText: '确认中止',
        danger: true,
      });
      if (!ok) return;
      await runBusy(async () => {
        await apiCall('/api/operation/abort');
        await refreshAll();
        showToast('已中止流程', 'success');
      });
    };

    $('btn-pull').onclick = () => runBusy(async () => {
      await apiCall('/api/pull', { rebase: state.settings.pullRebase });
      await refreshAll();
      showToast('拉取完成', 'success');
    });

    $('btn-push').onclick = () => runBusy(async () => {
      const forceWithLease = state.settings.forceWithLease;
      if (forceWithLease) {
        const ok = await showConfirmModal({
          title: '确认安全强推 (--force-with-lease)',
          body: `确定要以 --force-with-lease 推送当前分支 (${state.status?.branch || ''}) 吗？`,
          confirmText: '执行强推',
          danger: true,
        });
        if (!ok) return;
      }
      await apiCall('/api/push', { forceWithLease, setUpstream: true });
      await refreshAll();
      showToast('推送完成', 'success');
    });

    $('btn-sync').onclick = () => runBusy(async () => {
      await apiCall('/api/sync', { rebase: state.settings.pullRebase });
      await refreshAll();
      showToast('同步完成', 'success');
    });

    $('menu-fetch').onclick = () => {
      $('settings-popover').classList.add('hidden');
      runBusy(async () => {
        await apiCall('/api/fetch', { prune: true });
        state.lastFetchAt = Date.now();
        await refreshAll();
        showToast('Fetch 完成', 'success');
      });
    };

    $('btn-agent-conflicts').onclick = () => {
      const files = (state.status?.conflicted || []).map((f) => `- ${f.path}`).join('\n');
      sendToAgent(
        `仓库 \`${state.activeRepo}\` 在分支 \`${state.status?.branch || ''}\` 上存在以下合并冲突文件：\n${files}\n请逐一检查冲突标记，结合上下文安全解决冲突并确认状态。`,
      );
    };

    $('menu-agent-review').onclick = () => {
      $('settings-popover').classList.add('hidden');
      sendToAgent(
        `请审查仓库 \`${state.activeRepo}\` 当前未提交的 Git 改动（运行 \`git status\` 与 \`git diff\`），指出潜在 Bug、安全风险或代码改进建议（先只审查不修改文件）。`,
      );
    };

    $('menu-agent-pr').onclick = () => {
      $('settings-popover').classList.add('hidden');
      sendToAgent(
        `请检查仓库 \`${state.activeRepo}\` 当前分支 \`${state.status?.branch || ''}\` 的提交与差异，如有需要请先确认推送状态，并使用本机 \`gh\` CLI 协助我起草并创建 Pull Request。`,
      );
    };

    $('btn-create-branch').onclick = () => {
      const name = $('new-branch-name').value.trim();
      if (!name) {
        return showToast(
          getCurrentLang() === 'en' ? 'Please enter a new Branch name' : '请输入新 Branch 名称',
          'error',
        );
      }
      runBusy(async () => {
        await apiCall('/api/branch/create', { name, checkout: true });
        $('new-branch-name').value = '';
        await refreshAll();
        showToast(`已创建并切换到 ${name}`, 'success');
      });
    };

    $('btn-save-stash').onclick = () => runBusy(async () => {
      const message = $('stash-message').value.trim();
      const includeUntracked = $('opt-stash-untracked').checked;
      await apiCall('/api/stash/save', { message, includeUntracked });
      $('stash-message').value = '';
      await refreshAll();
      showToast('已保存到 Stash', 'success');
    });

    $('btn-reset-soft').onclick = async () => {
      const ok = await showConfirmModal({
        title: '撤销最近一次提交 (Soft Reset)',
        body: '将执行 git reset --soft HEAD~1：撤销最新提交记录，但所有改动完整保留在暂存区。确定继续吗？',
        confirmText: '撤销提交',
        danger: true,
      });
      if (!ok) return;
      await runBusy(async () => {
        await apiCall('/api/reset-soft');
        await refreshAll();
        showToast('已回退最新提交到暂存区', 'success');
      });
    };

    // 历史搜索（300ms 防抖）与分页加载更多
    let searchTimer = null;
    $('history-search').addEventListener('input', (e) => {
      state.historyQuery = e.target.value || '';
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        refreshHistory({ silent: true }).catch(() => {});
      }, 300);
    });

    $('btn-history-more').onclick = () => {
      refreshHistory({ append: true }).catch(() => {});
    };
  }

  async function init() {
    bindEvents();
    await loadSettings();

    if (window.sidecar?.onWorkspaceChange) {
      window.sidecar.onWorkspaceChange(async (uris) => {
        if (Array.isArray(uris) && uris.length > 0) {
          loadReposFromWorkspace(uris).catch(() => {});
          return;
        }
        const fallbackUris = await fetchWorkspaceUrisFromMetadata();
        loadReposFromWorkspace(fallbackUris).catch(() => {});
      });
    }

    const uris = await resolveWorkspaceUris();
    await loadReposFromWorkspace(uris);

    state.pollingTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && !state.busy && state.activeRepo) {
        refreshStatus({ silent: true }).catch(() => {});
        maybeAutoFetch({ force: false }).catch(() => {});
      }
    }, 6000);

    window.addEventListener('focus', () => {
      if (!state.busy && state.activeRepo) {
        refreshStatus({ silent: true }).catch(() => {});
        maybeAutoFetch({ force: false }).catch(() => {});
      }
    });
  }

  init();
})();
}
