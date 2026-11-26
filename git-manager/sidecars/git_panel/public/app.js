/**
 * Antigravity 原生 Git 管理侧边面板前端脚本。
 */
(() => {
  'use strict';

  const state = {
    workspaceUris: [],
    repos: [],
    activeRepo: '',
    status: null,
    branches: null,
    stashes: null,
    history: null,
    activeTab: 'changes',
    expandedDiffs: new Map(), // key -> { loading, data, error }
    expandedCommits: new Map(), // hash -> { loading, data, error }
    logs: [],
    busy: false,
    pollingTimer: null,
  };

  const $ = (id) => document.getElementById(id);

  function getConversationId() {
    if (window.sidecar?.conversationId) return window.sidecar.conversationId;
    try {
      return new URLSearchParams(window.location.search).get('conversationId') || '';
    } catch {
      return '';
    }
  }

  function reportFatalError(title, detail) {
    const emptyState = $('empty-state');
    const workspaceMain = $('workspace-main');
    if (emptyState && workspaceMain) {
      workspaceMain.classList.add('hidden');
      emptyState.classList.remove('hidden');
      $('empty-title').textContent = title;
      $('empty-desc').textContent = detail;
      $('empty-actions').classList.add('hidden');
    }
    state.logs.unshift({
      time: new Date().toLocaleTimeString(),
      command: 'frontend-runtime',
      ok: false,
      durationMs: 0,
      output: `${title}: ${detail}`,
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
    setTimeout(() => {
      el.remove();
    }, 3600);
  }

  function appendGitLogs(logs) {
    if (!Array.isArray(logs) || logs.length === 0) return;
    for (const item of logs) {
      if (!item || !item.command) continue;
      state.logs.unshift({
        time: new Date().toLocaleTimeString(),
        command: item.command,
        ok: Boolean(item.ok),
        durationMs: item.durationMs ?? 0,
        output: [item.stderr, item.stdout].filter(Boolean).join('\n').trim(),
      });
    }
    if (state.logs.length > 30) {
      state.logs.length = 30;
    }
    renderLogs();
  }

  function renderLogs() {
    $('log-count').textContent = String(state.logs.length);
    const latest = state.logs[0];
    $('log-last-summary').textContent = latest
      ? `${latest.ok ? '✓' : '✗'} ${latest.command} (${latest.durationMs}ms)`
      : '就绪';

    const container = $('log-entries');
    container.innerHTML = '';
    for (const entry of state.logs) {
      const div = document.createElement('div');
      div.className = `log-item ${entry.ok ? '' : 'err'}`;

      const head = document.createElement('div');
      head.className = 'log-item-head';

      const cmd = document.createElement('span');
      cmd.className = 'log-cmd';
      cmd.textContent = `[${entry.time}] ${entry.ok ? '✓' : '✗'} ${entry.command} (${entry.durationMs}ms)`;
      head.appendChild(cmd);

      if (!entry.ok) {
        const fixBtn = document.createElement('button');
        fixBtn.className = 'link-btn';
        fixBtn.textContent = '交给 Agent 排查';
        fixBtn.onclick = () => {
          sendToAgent(
            `我在仓库 \`${state.activeRepo}\` 执行以下命令失败：\n\`\`\`\n${entry.command}\n\`\`\`\n报错输出：\n\`\`\`\n${entry.output || '未知错误'}\n\`\`\`\n请帮我诊断原因并给出修复方案（如有安全修复步骤请协助处理）。`,
          );
        };
        head.appendChild(fixBtn);
      }

      div.appendChild(head);
      if (entry.output) {
        const pre = document.createElement('pre');
        pre.className = 'log-output';
        pre.textContent = entry.output.slice(0, 600);
        div.appendChild(pre);
      }
      container.appendChild(div);
    }
  }

  async function apiCall(route, payload = {}, { silent = false } = {}) {
    const fullPayload = {
      workspaceUris: state.workspaceUris,
      conversationId: getConversationId(),
      repoPath: state.activeRepo,
      ...payload,
    };
    const res = await sidecarFetch(route, fullPayload);
    if (res.logs) appendGitLogs(res.logs);
    else if (res.gitLog) appendGitLogs([res.gitLog]);

    if (!res.ok) {
      if (!silent) {
        showToast(res.error || '操作失败', 'error');
        state.logs.unshift({
          time: new Date().toLocaleTimeString(),
          command: route,
          ok: false,
          durationMs: 0,
          output: res.error || '操作失败',
        });
        if (state.logs.length > 30) state.logs.length = 30;
        renderLogs();
      }
      throw new Error(res.error || '操作失败');
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
        showToast(`发送给 Agent 失败：${err.message}`, 'error');
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

    for (const line of data.diff.split('\n')) {
      const row = document.createElement('div');
      row.className = 'diff-line';
      if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('new file')) {
        row.classList.add('meta');
      } else if (line.startsWith('@@')) {
        row.classList.add('hunk');
      } else if (line.startsWith('+')) {
        row.classList.add('add');
      } else if (line.startsWith('-')) {
        row.classList.add('del');
      }
      row.textContent = line || ' ';
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
      const data = await apiCall('/api/diff', { file, staged, untracked }, { silent: true });
      state.expandedDiffs.set(key, { loading: false, data });
    } catch (err) {
      state.expandedDiffs.set(key, { loading: false, error: err.message });
    }
    renderChanges();
  }

  function buildFileRow(item, kind) {
    const isStaged = kind === 'staged';
    const isUntracked = kind === 'untracked';
    const key = `${kind}:${item.path}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'file-item';

    const row = document.createElement('div');
    row.className = 'file-row';

    const badge = document.createElement('span');
    const code = isUntracked ? 'U' : (kind === 'conflicted' ? '!' : (item.code || 'M'));
    badge.className = `status-badge status-${kind === 'conflicted' ? 'X' : code}`;
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

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const openBtn = document.createElement('button');
    openBtn.className = 'mini-btn';
    openBtn.title = '在 Antigravity 打开文件';
    openBtn.textContent = '↗';
    openBtn.onclick = (e) => {
      e.stopPropagation();
      openFileInAntigravity(item.path);
    };
    actions.appendChild(openBtn);

    if (isStaged) {
      const unstageBtn = document.createElement('button');
      unstageBtn.className = 'mini-btn';
      unstageBtn.title = '取消暂存';
      unstageBtn.textContent = '−';
      unstageBtn.onclick = async (e) => {
        e.stopPropagation();
        await runBusy(async () => {
          await apiCall('/api/unstage', { paths: [item.path] });
          await refreshStatus();
        });
      };
      actions.appendChild(unstageBtn);
    } else {
      const stageBtn = document.createElement('button');
      stageBtn.className = 'mini-btn';
      stageBtn.title = '暂存';
      stageBtn.textContent = '+';
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
      discardBtn.textContent = '↩';
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

    const behindBadge = $('badge-behind');
    if (st.behind > 0) {
      behindBadge.textContent = `↓${st.behind}`;
      behindBadge.classList.remove('hidden');
    } else {
      behindBadge.classList.add('hidden');
    }

    const aheadBadge = $('badge-ahead');
    if (st.ahead > 0) {
      aheadBadge.textContent = `↑${st.ahead}`;
      aheadBadge.classList.remove('hidden');
    } else {
      aheadBadge.classList.add('hidden');
    }

    $('label-push').textContent = st.upstream ? '推送' : '发布分支';
    const hasRemote = st.remotes && st.remotes.length > 0;
    $('btn-pull').disabled = !hasRemote || !st.upstream || state.busy;
    $('btn-push').disabled = !hasRemote || !st.hasCommits || st.detached || state.busy;
    $('btn-sync').disabled = !hasRemote || state.busy;
  }

  function renderChanges() {
    const st = state.status;
    if (!st) return;

    const badge = $('tab-changes-count');
    if (st.totalChanges > 0) {
      badge.textContent = String(st.totalChanges);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }

    const conflictBanner = $('conflict-banner');
    const groupConflicted = $('group-conflicted');
    if (st.conflicted.length > 0) {
      conflictBanner.classList.remove('hidden');
      $('conflict-summary').textContent = `共 ${st.conflicted.length} 个冲突文件等待处理`;
      groupConflicted.classList.remove('hidden');
      $('count-conflicted').textContent = String(st.conflicted.length);
      const listConflicted = $('list-conflicted');
      listConflicted.innerHTML = '';
      for (const item of st.conflicted) {
        listConflicted.appendChild(buildFileRow(item, 'conflicted'));
      }
    } else {
      conflictBanner.classList.add('hidden');
      groupConflicted.classList.add('hidden');
    }

    $('count-staged').textContent = String(st.staged.length);
    const listStaged = $('list-staged');
    listStaged.innerHTML = '';
    for (const item of st.staged) {
      listStaged.appendChild(buildFileRow(item, 'staged'));
    }
    $('btn-unstage-all').classList.toggle('hidden', st.staged.length === 0);

    const unstagedAll = [
      ...st.unstaged.map((u) => ({ ...u, _kind: 'unstaged' })),
      ...st.untracked.map((u) => ({ ...u, _kind: 'untracked' })),
    ];
    $('count-unstaged').textContent = String(unstagedAll.length);
    const listUnstaged = $('list-unstaged');
    listUnstaged.innerHTML = '';
    for (const item of unstagedAll) {
      listUnstaged.appendChild(buildFileRow(item, item._kind));
    }
    $('btn-stage-all').classList.toggle('hidden', unstagedAll.length === 0);

    $('clean-tree-hint').classList.toggle('hidden', st.totalChanges > 0);
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
            body: `确定要删除分支 "${b.name}" 吗？（默认使用安全删除 git branch -d）`,
            confirmText: '删除分支',
            danger: true,
          });
          if (!ok) return;
          await runBusy(async () => {
            await apiCall('/api/branch/delete', { name: b.name, force: false });
            await refreshBranches();
            showToast(`已删除分支 ${b.name}`, 'success');
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
      const row = document.createElement('div');
      row.className = 'list-row';
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
      applyBtn.onclick = () => runBusy(async () => {
        await apiCall('/api/stash/apply', { ref: s.ref });
        await refreshAll();
        showToast(`已应用 ${s.ref}`, 'success');
      });

      const popBtn = document.createElement('button');
      popBtn.className = 'mini-btn';
      popBtn.textContent = 'Pop';
      popBtn.onclick = () => runBusy(async () => {
        await apiCall('/api/stash/pop', { ref: s.ref });
        await refreshAll();
        showToast(`已弹出 ${s.ref}`, 'success');
      });

      const dropBtn = document.createElement('button');
      dropBtn.className = 'mini-btn danger';
      dropBtn.textContent = 'Drop';
      dropBtn.onclick = async () => {
        const ok = await showConfirmModal({
          title: '删除 Stash 记录',
          body: `确定要丢弃 "${s.ref}" (${s.message}) 吗？`,
          confirmText: '删除',
          danger: true,
        });
        if (!ok) return;
        await runBusy(async () => {
          await apiCall('/api/stash/drop', { ref: s.ref });
          await refreshStashes();
          showToast(`已删除 ${s.ref}`, 'success');
        });
      };

      actions.append(applyBtn, popBtn, dropBtn);
      row.appendChild(actions);
      container.appendChild(row);
    }
  }

  function renderHistory() {
    const commits = state.history?.commits || [];
    const container = $('list-history');
    container.innerHTML = '';
    if (commits.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'diff-empty';
      empty.textContent = '当前分支尚无提交历史';
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
          const data = await apiCall('/api/commit-detail', { hash: c.hash }, { silent: true });
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

  async function refreshStatus({ silent = false } = {}) {
    if (!state.activeRepo) return;
    const activeEntry = state.repos.find((r) => r.path === state.activeRepo);
    if (!activeEntry?.isGitRepo) return;

    state.status = await apiCall('/api/status', {}, { silent });
    renderHeaderAndSyncBar();
    renderChanges();
  }

  async function refreshBranches({ silent = false } = {}) {
    if (!state.activeRepo) return;
    state.branches = await apiCall('/api/branches', {}, { silent });
    renderBranches();
  }

  async function refreshStashes({ silent = false } = {}) {
    if (!state.activeRepo) return;
    state.stashes = await apiCall('/api/stashes', {}, { silent });
    renderStashes();
  }

  async function refreshHistory({ silent = false } = {}) {
    if (!state.activeRepo) return;
    state.history = await apiCall('/api/log', { limit: 50 }, { silent });
    renderHistory();
  }

  async function refreshActiveTab() {
    if (state.activeTab === 'branches') await refreshBranches();
    else if (state.activeTab === 'stash') await refreshStashes();
    else if (state.activeTab === 'history') await refreshHistory();
  }

  async function refreshAll() {
    const isGit = renderRepoSelector();
    if (!isGit) return;
    await refreshStatus();
    await Promise.all([
      refreshActiveTab(),
      state.activeTab === 'stash' ? Promise.resolve() : refreshStashes({ silent: true }),
    ]);
  }

  async function loadReposFromWorkspace(uris) {
    state.workspaceUris = Array.isArray(uris) ? uris : [];
    const convId = getConversationId();

    if (state.workspaceUris.length === 0 && !convId) {
      state.repos = [];
      state.activeRepo = '';
      state.status = null;
      renderRepoSelector();
      return;
    }

    const res = await sidecarFetch('/api/repos', {
      workspaceUris: state.workspaceUris,
      conversationId: convId,
    });
    if (!res.ok) {
      showToast(res.error || '扫描仓库失败', 'error');
      reportFatalError('扫描 Git 仓库失败', res.error || '未知错误');
      return;
    }

    if (Array.isArray(res.data?.workspaceUris) && res.data.workspaceUris.length > 0) {
      state.workspaceUris = res.data.workspaceUris;
    }

    state.repos = res.data?.repos || [];
    if (!state.repos.some((r) => r.path === state.activeRepo)) {
      state.activeRepo = state.repos[0]?.path || '';
      state.expandedDiffs.clear();
      state.expandedCommits.clear();
    }
    await refreshAll();
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
      state.expandedDiffs.clear();
      state.expandedCommits.clear();
      await refreshAll();
    };

    $('btn-refresh').onclick = () => runBusy(async () => {
      let uris = state.workspaceUris;
      if (!uris || uris.length === 0) {
        uris = await resolveWorkspaceUris();
      }
      await loadReposFromWorkspace(uris);
    });

    $('btn-toggle-log').onclick = () => {
      $('log-drawer').classList.toggle('collapsed');
    };
    $('log-drawer-toggle').onclick = () => {
      $('log-drawer').classList.toggle('collapsed');
    };

    $('btn-branch-pill').onclick = () => switchTab('branches');

    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.onclick = () => switchTab(btn.dataset.tab);
    });

    $('btn-more-menu').onclick = (e) => {
      e.stopPropagation();
      $('more-menu').classList.toggle('hidden');
    };
    document.addEventListener('click', (e) => {
      if (!$('more-menu').contains(e.target) && e.target !== $('btn-more-menu')) {
        $('more-menu').classList.add('hidden');
      }
    });

    $('opt-force-lease').onchange = async (e) => {
      if (e.target.checked) {
        const ok = await showConfirmModal({
          title: '开启安全强推选项',
          body: '开启后，“推送”按钮将附加 --force-with-lease 参数（通常用于 Amend 或 Rebase 后安全覆盖自己分支的远端历史）。确定开启吗？',
          confirmText: '确认开启',
          danger: true,
        });
        if (!ok) e.target.checked = false;
      }
    };

    $('btn-init-repo').onclick = () => runBusy(async () => {
      await apiCall('/api/init');
      showToast('已初始化 Git 仓库', 'success');
      await loadReposFromWorkspace(state.workspaceUris);
    });

    $('btn-stage-all').onclick = () => runBusy(async () => {
      await apiCall('/api/stage-all');
      await refreshStatus();
    });
    $('btn-unstage-all').onclick = () => runBusy(async () => {
      await apiCall('/api/unstage-all');
      await refreshStatus();
    });

    const doCommit = async ({ andPush = false } = {}) => {
      const message = $('commit-message').value;
      const stageAll = $('opt-stage-all').checked;
      const amend = $('opt-amend').checked;
      await runBusy(async () => {
        await apiCall('/api/commit', { message, stageAll, amend });
        $('commit-message').value = '';
        $('opt-amend').checked = false;
        state.expandedDiffs.clear();
        if (andPush) {
          const forceWithLease = $('opt-force-lease').checked;
          await apiCall('/api/push', { forceWithLease, setUpstream: true });
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

    $('btn-pull').onclick = () => runBusy(async () => {
      const rebase = $('opt-pull-rebase').checked;
      await apiCall('/api/pull', { rebase });
      await refreshAll();
      showToast('拉取完成', 'success');
    });

    $('btn-push').onclick = () => runBusy(async () => {
      const forceWithLease = $('opt-force-lease').checked;
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
      const rebase = $('opt-pull-rebase').checked;
      await apiCall('/api/sync', { rebase });
      await refreshAll();
      showToast('同步完成', 'success');
    });

    $('menu-fetch').onclick = () => {
      $('more-menu').classList.add('hidden');
      runBusy(async () => {
        await apiCall('/api/fetch', { prune: true });
        await refreshAll();
        showToast('Fetch 完成', 'success');
      });
    };

    $('btn-agent-commit').onclick = () => {
      const st = state.status;
      sendToAgent(
        `请针对仓库 \`${state.activeRepo}\`（当前分支：\`${st?.branch || ''}\`）检查 \`git status\` 与 \`git diff\`，排除敏感文件后生成清晰的 Conventional Commits 提交说明并完成暂存与提交。`,
      );
    };

    $('btn-agent-conflicts').onclick = () => {
      const files = (state.status?.conflicted || []).map((f) => `- ${f.path}`).join('\n');
      sendToAgent(
        `仓库 \`${state.activeRepo}\` 在分支 \`${state.status?.branch || ''}\` 上存在以下合并冲突文件：\n${files}\n请逐一检查冲突标记，结合上下文安全解决冲突并确认状态。`,
      );
    };

    $('menu-agent-review').onclick = () => {
      $('more-menu').classList.add('hidden');
      sendToAgent(
        `请审查仓库 \`${state.activeRepo}\` 当前未提交的 Git 改动（运行 \`git status\` 与 \`git diff\`），指出潜在 Bug、安全风险或代码改进建议（先只审查不修改文件）。`,
      );
    };

    $('menu-agent-pr').onclick = () => {
      $('more-menu').classList.add('hidden');
      sendToAgent(
        `请检查仓库 \`${state.activeRepo}\` 当前分支 \`${state.status?.branch || ''}\` 的提交与差异，如有需要请先确认推送状态，并使用本机 \`gh\` CLI 协助我起草并创建 Pull Request。`,
      );
    };

    $('btn-create-branch').onclick = () => {
      const name = $('new-branch-name').value.trim();
      if (!name) return showToast('请输入新分支名称', 'error');
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
  }

  async function init() {
    bindEvents();

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
      }
    }, 6000);

    window.addEventListener('focus', () => {
      if (!state.busy && state.activeRepo) {
        refreshStatus({ silent: true }).catch(() => {});
      }
    });
  }

  init();
})();
