// Claude Code Account Switcher
// Switches Claude Code accounts by swapping the saved OAuth credentials
// (~/.claude/.credentials.json + "oauthAccount" in ~/.claude.json).
// Account snapshots are stored encrypted in VS Code SecretStorage.

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const t = vscode.l10n.t;

const STATE_KEY = 'claudeCodeAccountSwitcher.state.v1';
const PENDING_ADD_KEY = 'claudeCodeAccountSwitcher.pendingAdd';
const SECRET_PREFIX = 'claudeCodeAccountSwitcher.account:';

/** @type {vscode.ExtensionContext} */
let ctx;
/** @type {vscode.StatusBarItem} */
let statusItem;
let backupDoneThisSession = false;
let syncTimer;
let busy = false;
let prompting = false;
const dismissedEmails = new Set();

// ---------------------------------------------------------------- paths

function cfg() {
  return vscode.workspace.getConfiguration('claudeCodeAccountSwitcher');
}

function expandHome(p) {
  if (!p) return p;
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p.replace(/%USERPROFILE%/gi, os.homedir());
}

/** Custom config dir (setting or env), or null for the default. */
function customConfigDir() {
  const fromSetting = (cfg().get('claudeConfigDir') || '').trim();
  if (fromSetting) return expandHome(fromSetting);
  if (process.env.CLAUDE_CONFIG_DIR) return expandHome(process.env.CLAUDE_CONFIG_DIR);
  return null;
}

function claudeDir() {
  return customConfigDir() || path.join(os.homedir(), '.claude');
}

function credentialsPath() {
  return path.join(claudeDir(), '.credentials.json');
}

function claudeJsonPath() {
  const custom = customConfigDir();
  return custom ? path.join(custom, '.claude.json') : path.join(os.homedir(), '.claude.json');
}

// ---------------------------------------------------------------- file helpers

function readJson(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return raw.trim() ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.cas-${process.pid}.tmp`;
  const text = JSON.stringify(data, null, 2);
  try {
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, file);
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    // fallback: direct write (e.g. file locked by antivirus)
    fs.writeFileSync(file, text, 'utf8');
  }
}

function backupOnce() {
  if (backupDoneThisSession) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(os.homedir(), '.claude-account-switcher-backup', stamp);
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of [credentialsPath(), claudeJsonPath()]) {
      if (fs.existsSync(f)) fs.copyFileSync(f, path.join(dir, path.basename(f)));
    }
    backupDoneThisSession = true;
  } catch (e) {
    console.warn('[claude-account-switcher] backup failed', e);
  }
}

// ---------------------------------------------------------------- state

/** @returns {{active: string|null, accounts: {id:string,name:string,email:string,org?:string}[]}} */
function getState() {
  const s = ctx.globalState.get(STATE_KEY);
  return s && Array.isArray(s.accounts) ? s : { active: null, accounts: [] };
}

async function setState(s) {
  await ctx.globalState.update(STATE_KEY, s);
  updateStatus();
}

function readLive() {
  const creds = readJson(credentialsPath());
  const cj = readJson(claudeJsonPath()) || {};
  const oauthAccount = cj.oauthAccount || null;
  const email = oauthAccount && oauthAccount.emailAddress ? String(oauthAccount.emailAddress) : '';
  const org = oauthAccount && oauthAccount.organizationName ? String(oauthAccount.organizationName) : '';
  const hasCreds = !!(creds && Object.keys(creds).length);
  return { creds, oauthAccount, email, org, hasCreds };
}

async function storeSnapshot(id, live) {
  await ctx.secrets.store(
    SECRET_PREFIX + id,
    JSON.stringify({ creds: live.creds, oauthAccount: live.oauthAccount, savedAt: Date.now() })
  );
}

async function loadSnapshot(id) {
  const raw = await ctx.secrets.get(SECRET_PREFIX + id);
  return raw ? JSON.parse(raw) : null;
}

function findByEmail(state, email) {
  if (!email) return undefined;
  return state.accounts.find(a => a.email.toLowerCase() === email.toLowerCase());
}

/**
 * Aligns saved state with what's actually on disk:
 * - if the logged-in account is known, refresh its snapshot (renewed tokens) and mark it active;
 * - if it's unknown, offer to save it.
 */
async function syncWithDisk({ promptUnknown = true } = {}) {
  if (busy) return;
  const live = readLive();
  const state = getState();

  if (!live.hasCreds) {
    if (state.active) await setState({ ...state, active: null });
    else updateStatus();
    return;
  }

  const known = findByEmail(state, live.email);
  if (known) {
    await storeSnapshot(known.id, live);
    if (state.active !== known.id) await setState({ ...state, active: known.id });
    else updateStatus();
    if (ctx.globalState.get(PENDING_ADD_KEY)) await ctx.globalState.update(PENDING_ADD_KEY, false);
    return;
  }

  updateStatus();
  if (!promptUnknown || !live.email || prompting || dismissedEmails.has(live.email)) return;

  prompting = true;
  try {
    const pending = ctx.globalState.get(PENDING_ADD_KEY);
    if (pending) {
      await saveCurrent(t('New Claude login detected: {0}. What do you want to call this account?', live.email));
    } else {
      const save = t('Save');
      const choice = await vscode.window.showInformationMessage(
        t('Claude account not saved yet: {0}. Save it so you can switch back with one click?', live.email),
        save,
        t('Later')
      );
      if (choice === save) await saveCurrent();
      else dismissedEmails.add(live.email);
    }
  } finally {
    prompting = false;
  }
}

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncWithDisk().catch(reportError), 1500);
}

// ---------------------------------------------------------------- UI

function updateStatus() {
  if (!statusItem) return;
  const state = getState();
  const active = state.accounts.find(a => a.id === state.active);
  const live = readLive();
  if (active) {
    statusItem.text = `$(account) Claude: ${active.name}`;
    statusItem.tooltip = new vscode.MarkdownString(
      `**${t('Active Claude account:')}** ${active.name}\n\n${active.email}${active.org ? ` — ${active.org}` : ''}\n\n_${t('Click to switch account (Ctrl+Alt+A)')}_`
    );
    statusItem.backgroundColor = undefined;
  } else if (live.hasCreds) {
    statusItem.text = `$(account) Claude: ${live.email || t('not saved')}`;
    statusItem.tooltip = t('Logged in but not saved yet. Click to manage accounts.');
    statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    statusItem.text = `$(account) Claude: ${t('no account')}`;
    statusItem.tooltip = t('No Claude account logged in. Click to manage accounts.');
    statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  statusItem.show();
}

async function askName(prompt, value) {
  return vscode.window.showInputBox({
    prompt,
    value,
    validateInput: v => (v.trim() ? undefined : t('Name cannot be empty')),
  });
}

async function pickAccount(placeHolder) {
  const state = getState();
  if (!state.accounts.length) {
    vscode.window.showInformationMessage(t('No saved accounts.'));
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    state.accounts.map(a => ({ label: a.name, description: a.email, id: a.id })),
    { placeHolder }
  );
  return pick ? state.accounts.find(a => a.id === pick.id) : undefined;
}

async function reloadAfterChange(text) {
  if (cfg().get('autoReload')) {
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
    return;
  }
  const reload = t('Reload Window');
  const c = await vscode.window.showInformationMessage(text, reload);
  if (c === reload) await vscode.commands.executeCommand('workbench.action.reloadWindow');
}

function reportError(e) {
  console.error('[claude-account-switcher]', e);
  vscode.window.showErrorMessage(`Claude Code Account Switcher: ${e && e.message ? e.message : e}`);
}

// ---------------------------------------------------------------- commands

async function menu() {
  await syncWithDisk({ promptUnknown: false });
  const state = getState();
  const live = readLive();
  /** @type {(vscode.QuickPickItem & {action?: string, id?: string})[]} */
  const items = state.accounts.map(a => ({
    label: `${a.id === state.active ? '$(check)' : '$(account)'} ${a.name}`,
    description: a.email,
    detail: a.id === state.active ? t('Active') : undefined,
    action: 'switch',
    id: a.id,
  }));
  items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
  if (live.hasCreds && !findByEmail(state, live.email)) {
    items.push({ label: `$(save) ${t('Save current account')}`, description: live.email, action: 'save' });
  }
  items.push({ label: `$(add) ${t('Add new account…')}`, action: 'add' });
  if (state.accounts.length) {
    items.push({ label: `$(edit) ${t('Rename account…')}`, action: 'rename' });
    items.push({ label: `$(trash) ${t('Remove saved account…')}`, action: 'remove' });
  }

  const pick = await vscode.window.showQuickPick(items, { placeHolder: t('Choose the Claude account to use') });
  if (!pick) return;
  switch (pick.action) {
    case 'switch': return switchTo(pick.id);
    case 'save': return saveCurrent();
    case 'add': return addAccount();
    case 'rename': return rename();
    case 'remove': return remove();
  }
}

async function saveCurrent(promptText) {
  const live = readLive();
  if (!live.hasCreds) {
    vscode.window.showWarningMessage(t('No Claude account logged in to save. Log in to Claude Code first.'));
    return;
  }
  const state = getState();
  const existing = findByEmail(state, live.email);
  if (existing) {
    await storeSnapshot(existing.id, live);
    await setState({ ...state, active: existing.id });
    vscode.window.showInformationMessage(t('Account "{0}" updated.', existing.name));
    return;
  }
  const defaultName = live.email ? live.email.split('@')[0] : 'Account';
  const name = await askName(promptText || t('Name for account {0}', live.email || ''), defaultName);
  if (!name) return;
  const id = crypto.randomUUID();
  await storeSnapshot(id, live);
  await ctx.globalState.update(PENDING_ADD_KEY, false);
  await setState({
    active: id,
    accounts: [...state.accounts, { id, name: name.trim(), email: live.email, org: live.org }],
  });
  vscode.window.showInformationMessage(t('Account "{0}" saved.', name.trim()));
}

async function switchTo(id) {
  const state = getState();
  const target = state.accounts.find(a => a.id === id);
  if (!target) return;
  if (state.active === id && findByEmail(state, readLive().email) === target) {
    vscode.window.showInformationMessage(t('You are already using "{0}".', target.name));
    return;
  }

  // save (possibly refreshed) tokens of the current account before leaving it
  await syncWithDisk({ promptUnknown: false });
  const live = readLive();
  if (live.hasCreds && !findByEmail(getState(), live.email)) {
    const saveAndContinue = t('Save and continue');
    const c = await vscode.window.showWarningMessage(
      t('The current account ({0}) is not saved: after switching you will need to log in again to get it back.', live.email || '?'),
      { modal: true },
      saveAndContinue,
      t('Continue without saving')
    );
    if (!c) return;
    if (c === saveAndContinue) await saveCurrent();
  }

  const snap = await loadSnapshot(id);
  if (!snap || !snap.creds) {
    vscode.window.showErrorMessage(t('Credentials for "{0}" not found. Remove the account and add it again.', target.name));
    return;
  }

  busy = true;
  try {
    backupOnce();
    writeJsonAtomic(credentialsPath(), snap.creds);
    const cj = readJson(claudeJsonPath()) || {};
    if (snap.oauthAccount) cj.oauthAccount = snap.oauthAccount;
    else delete cj.oauthAccount;
    writeJsonAtomic(claudeJsonPath(), cj);
    await setState({ ...getState(), active: id });
  } finally {
    busy = false;
  }

  vscode.window.showInformationMessage(t('Claude account: {0} ({1})', target.name, target.email));
  await reloadAfterChange(t('Switched to "{0}". Reload the window to apply it to the Claude Code extension.', target.name));
}

async function addAccount() {
  await syncWithDisk({ promptUnknown: false });
  const live = readLive();
  const state = getState();

  if (live.hasCreds) {
    if (!findByEmail(state, live.email)) {
      const save = t('Save');
      const c = await vscode.window.showWarningMessage(
        t('Before adding a new account, do you want to save the current one ({0})?', live.email || '?'),
        { modal: true },
        save,
        t("Don't save")
      );
      if (!c) return;
      if (c === save) await saveCurrent();
    }
    const cont = t('Continue');
    const ok = await vscode.window.showWarningMessage(
      t('Claude Code will be logged out (the current account stays saved). Then log in with the new account from the Claude Code panel.'),
      { modal: true },
      cont
    );
    if (ok !== cont) return;

    busy = true;
    try {
      backupOnce();
      try { fs.unlinkSync(credentialsPath()); } catch { /* already missing */ }
      const cj = readJson(claudeJsonPath());
      if (cj && cj.oauthAccount) {
        delete cj.oauthAccount;
        writeJsonAtomic(claudeJsonPath(), cj);
      }
      await setState({ ...getState(), active: null });
    } finally {
      busy = false;
    }
  }

  await ctx.globalState.update(PENDING_ADD_KEY, true);
  await reloadAfterChange(
    t('Now log in with the new account in the Claude Code panel (or with /login). It will be detected and saved automatically.')
  );
}

async function rename() {
  const acc = await pickAccount(t('Which account do you want to rename?'));
  if (!acc) return;
  const name = await askName(t('New name for {0}', acc.email), acc.name);
  if (!name) return;
  const state = getState();
  await setState({
    ...state,
    accounts: state.accounts.map(a => (a.id === acc.id ? { ...a, name: name.trim() } : a)),
  });
}

async function remove() {
  const acc = await pickAccount(t('Which account do you want to remove from the list?'));
  if (!acc) return;
  const removeLabel = t('Remove');
  const ok = await vscode.window.showWarningMessage(
    t('Remove "{0}" ({1}) from saved accounts? You will not be logged out if it is the active one.', acc.name, acc.email),
    { modal: true },
    removeLabel
  );
  if (ok !== removeLabel) return;
  await ctx.secrets.delete(SECRET_PREFIX + acc.id);
  const state = getState();
  await setState({
    active: state.active === acc.id ? null : state.active,
    accounts: state.accounts.filter(a => a.id !== acc.id),
  });
}

// ---------------------------------------------------------------- conflicts

async function checkConflicts() {
  const env = vscode.workspace.getConfiguration('claudeCode').get('environmentVariables');
  if (!Array.isArray(env) || !env.some(e => e && e.name === 'CLAUDE_CONFIG_DIR')) return;
  if (cfg().get('claudeConfigDir')) return; // configured on purpose by the user
  const removeLabel = t('Remove it');
  const c = await vscode.window.showWarningMessage(
    t('CLAUDE_CONFIG_DIR is set in "claudeCode.environmentVariables" (maybe by another switcher). It can make Claude Code use a different folder than the one managed here.'),
    removeLabel,
    t('Ignore')
  );
  if (c === removeLabel) {
    const conf = vscode.workspace.getConfiguration('claudeCode');
    const inspect = conf.inspect('environmentVariables');
    const filtered = env.filter(e => !(e && e.name === 'CLAUDE_CONFIG_DIR'));
    const target = inspect && inspect.workspaceValue !== undefined
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    await conf.update('environmentVariables', filtered.length ? filtered : undefined, target);
    await reloadAfterChange(t('CLAUDE_CONFIG_DIR removed. Reload the window.'));
  }
}

// ---------------------------------------------------------------- lifecycle

function activate(context) {
  ctx = context;

  if (process.platform === 'darwin') {
    vscode.window.showWarningMessage(
      t('Claude Code Account Switcher: macOS is not supported (Claude Code stores credentials in the Keychain there).')
    );
    return;
  }

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.command = 'claudeCodeAccountSwitcher.menu';
  context.subscriptions.push(statusItem);

  const wrap = fn => (...args) => Promise.resolve(fn(...args)).catch(reportError);
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeCodeAccountSwitcher.menu', wrap(menu)),
    vscode.commands.registerCommand('claudeCodeAccountSwitcher.saveCurrent', wrap(() => saveCurrent())),
    vscode.commands.registerCommand('claudeCodeAccountSwitcher.add', wrap(addAccount)),
    vscode.commands.registerCommand('claudeCodeAccountSwitcher.rename', wrap(rename)),
    vscode.commands.registerCommand('claudeCodeAccountSwitcher.remove', wrap(remove))
  );

  // watch Claude files to detect logins / token refreshes
  const watchers = [
    new vscode.RelativePattern(vscode.Uri.file(claudeDir()), '.credentials.json'),
    new vscode.RelativePattern(vscode.Uri.file(path.dirname(claudeJsonPath())), '.claude.json'),
  ].map(p => vscode.workspace.createFileSystemWatcher(p));
  for (const w of watchers) {
    w.onDidChange(scheduleSync);
    w.onDidCreate(scheduleSync);
    w.onDidDelete(scheduleSync);
    context.subscriptions.push(w);
  }
  // fallback: re-check when the window regains focus
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(s => { if (s.focused) scheduleSync(); }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('claudeCodeAccountSwitcher')) scheduleSync();
    })
  );

  updateStatus();
  syncWithDisk().catch(reportError);
  checkConflicts().catch(reportError);
}

function deactivate() {
  clearTimeout(syncTimer);
}

module.exports = { activate, deactivate };

