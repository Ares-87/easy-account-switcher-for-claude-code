const fs = require('fs');
const path = require('path');
const puppeteer = require('./node_modules/puppeteer-core');
const { PNG } = require('./node_modules/pngjs');
const { GIFEncoder, quantize, applyPalette } = require('./node_modules/gifenc');

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];

const executablePath = CHROME_PATHS.find(p => fs.existsSync(p));
if (!executablePath) {
  throw new Error('Neither Chrome nor Edge found');
}

const WIDTH = 880;
const HEIGHT = 480;

const HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-font-smoothing: antialiased; }
  body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    background: #1f1f1f;
    color: #cccccc;
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 13px;
    position: relative;
  }

  /* Titlebar */
  .titlebar {
    height: 30px;
    background: #181818;
    border-bottom: 1px solid #2b2b2b;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    font-size: 12px;
    color: #9d9d9d;
  }
  .titlebar-left { display: flex; align-items: center; gap: 12px; }
  .titlebar-menu { display: flex; gap: 10px; color: #cccccc; font-size: 12px; }
  .titlebar-search {
    width: 340px;
    height: 22px;
    background: #242424;
    border: 1px solid #3c3c3c;
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: #9d9d9d;
    font-size: 12px;
  }
  .win-controls { display: flex; gap: 14px; color: #cccccc; padding-right: 4px; }

  /* Main layout */
  .workbench {
    display: flex;
    height: calc(100% - 30px - 22px);
  }

  /* Activity Bar */
  .activitybar {
    width: 48px;
    background: #181818;
    border-right: 1px solid #2b2b2b;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 8px;
    gap: 18px;
  }
  .act-icon {
    width: 48px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #858585;
    position: relative;
  }
  .act-icon.active { color: #ffffff; }
  .act-icon.active::before {
    content: "";
    position: absolute;
    left: 0;
    top: 4px;
    bottom: 4px;
    width: 2px;
    background: #0078d4;
  }

  /* Sidebar */
  .sidebar {
    width: 175px;
    background: #181818;
    border-right: 1px solid #2b2b2b;
    display: flex;
    flex-direction: column;
  }
  .sidebar-header {
    height: 35px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    letter-spacing: 0.5px;
    color: #bbbbbb;
    text-transform: uppercase;
  }
  .tree-item {
    height: 22px;
    display: flex;
    align-items: center;
    padding-left: 12px;
    gap: 6px;
    font-size: 12.5px;
    color: #cccccc;
    white-space: nowrap;
  }
  .tree-item.indent-1 { padding-left: 24px; }
  .tree-item.indent-2 { padding-left: 36px; }
  .tree-item.selected { background: #04395e; color: #ffffff; }
  .ts-badge { color: #3178c6; font-weight: 700; font-size: 11px; width: 16px; text-align: center; }
  .json-badge { color: #cbcb41; font-weight: 700; font-size: 11px; width: 16px; text-align: center; }

  /* Editor */
  .editor-area {
    flex: 1;
    background: #1f1f1f;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .tabs {
    height: 35px;
    background: #181818;
    border-bottom: 1px solid #2b2b2b;
    display: flex;
  }
  .tab {
    height: 35px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    gap: 7px;
    background: #181818;
    border-right: 1px solid #2b2b2b;
    color: #9d9d9d;
    font-size: 13px;
    position: relative;
  }
  .tab.active {
    background: #1f1f1f;
    color: #ffffff;
  }
  .tab.active::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: #0078d4;
  }
  .breadcrumbs {
    height: 22px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 6px;
    color: #858585;
    font-size: 12px;
    border-bottom: 1px solid #252526;
  }
  .code-canvas {
    padding: 14px 0;
    font-family: Consolas, "Cascadia Code", monospace;
    font-size: 13px;
    line-height: 22px;
    white-space: nowrap;
  }
  .code-line {
    display: flex;
    padding-right: 16px;
  }
  .code-line.active-line { background: rgba(255,255,255,0.04); }
  .ln {
    width: 44px;
    text-align: right;
    padding-right: 16px;
    color: #6e7681;
    font-size: 12px;
    flex-shrink: 0;
  }
  .kw { color: #569cd6; }
  .fn { color: #dcdcaa; }
  .str { color: #ce9178; }
  .cmt { color: #6a9955; }
  .var { color: #9cdcfe; }
  .typ { color: #4ec9b0; }

  /* Claude Panel on the right */
  .claude-panel {
    width: 215px;
    background: #181818;
    border-left: 1px solid #2b2b2b;
    display: flex;
    flex-direction: column;
  }
  .claude-header {
    height: 35px;
    padding: 0 12px;
    border-bottom: 1px solid #2b2b2b;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    color: #cccccc;
  }
  .claude-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .claude-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #d97757;
  }
  .claude-body {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 12px;
  }
  .claude-card {
    background: #222222;
    border: 1px solid #2e2e2e;
    border-radius: 6px;
    padding: 10px;
  }
  .claude-card-title { color: #9d9d9d; font-size: 11px; margin-bottom: 4px; }
  .claude-card-val { color: #ffffff; font-weight: 600; font-size: 12px; }
  .claude-card-sub { color: #858585; font-size: 11px; margin-top: 2px; }

  /* Status Bar */
  .statusbar {
    height: 22px;
    background: #181818;
    border-top: 1px solid #2b2b2b;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: #cccccc;
    position: relative;
    z-index: 20;
  }
  .sb-left, .sb-right {
    display: flex;
    align-items: center;
    height: 100%;
  }
  .sb-remote {
    background: #0078d4;
    color: #ffffff;
    height: 100%;
    padding: 0 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
  }
  .sb-item {
    height: 100%;
    padding: 0 8px;
    display: flex;
    align-items: center;
    gap: 5px;
    color: #cccccc;
    white-space: nowrap;
  }
  .sb-item.claude-btn {
    color: #ffffff;
    background: rgba(0, 120, 212, 0.25);
    border-left: 1px solid #2b2b2b;
    border-right: 1px solid #2b2b2b;
    font-weight: 500;
    padding: 0 10px;
    position: relative;
  }
  .sb-item.claude-btn.hovered {
    background: rgba(0, 120, 212, 0.48);
  }
  .sb-item.claude-btn.warning {
    background: #9e5400;
    color: #ffffff;
  }
  .sb-item.claude-btn.warning.hovered {
    background: #b86200;
  }

  /* Focus Pulse Ring around Status Bar Item */
  .focus-ring {
    position: absolute;
    border: 2px solid #d97757;
    border-radius: 4px;
    box-shadow: 0 0 0 3px rgba(217, 119, 87, 0.35), 0 0 14px rgba(217, 119, 87, 0.85);
    pointer-events: none;
    z-index: 35;
    display: none;
  }

  /* Status Bar Tooltip */
  .sb-tooltip {
    position: absolute;
    left: 150px;
    bottom: 28px;
    background: #252526;
    border: 1px solid #454545;
    border-radius: 4px;
    padding: 8px 11px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.55);
    color: #cccccc;
    font-size: 12px;
    line-height: 1.5;
    z-index: 30;
    display: none;
  }
  .sb-tooltip strong { color: #ffffff; }
  .sb-tooltip em { color: #858585; font-style: normal; font-size: 11px; }

  /* QuickPick Modal */
  .quickpick {
    position: absolute;
    top: 34px;
    left: 50%;
    transform: translateX(-50%);
    width: 520px;
    background: #252526;
    border: 1px solid #454545;
    border-radius: 6px;
    box-shadow: 0 10px 32px rgba(0, 0, 0, 0.65);
    z-index: 40;
    overflow: hidden;
    display: none;
  }
  .qp-input-wrap {
    padding: 7px 8px;
    border-bottom: 1px solid #333333;
  }
  .qp-input {
    width: 100%;
    height: 26px;
    background: #313131;
    border: 1px solid #0078d4;
    border-radius: 3px;
    padding: 0 8px;
    display: flex;
    align-items: center;
    color: #ffffff;
    font-size: 13px;
  }
  .qp-input.placeholder { color: #858585; }
  .qp-subtext {
    padding: 5px 10px 8px;
    font-size: 11.5px;
    color: #cccccc;
    background: #252526;
  }
  .qp-list {
    padding: 4px 0;
  }
  .qp-row {
    height: 26px;
    padding: 0 10px;
    margin: 0 4px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    color: #cccccc;
  }
  .qp-row.active {
    background: #04395e;
    color: #ffffff;
  }
  .qp-row-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .qp-email {
    color: #8c8c8c;
    font-size: 12px;
    margin-left: 6px;
  }
  .qp-row.active .qp-email {
    color: #b8d4e8;
  }
  .qp-badge {
    font-size: 11px;
    color: #75beff;
    background: rgba(0, 120, 212, 0.2);
    padding: 1px 6px;
    border-radius: 3px;
  }
  .qp-sep {
    height: 1px;
    background: #383838;
    margin: 4px 8px;
  }

  /* Notification Toast */
  .toast {
    position: absolute;
    right: 14px;
    bottom: 32px;
    width: 420px;
    background: #252526;
    border: 1px solid #454545;
    border-radius: 5px;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.65);
    padding: 12px 14px;
    z-index: 38;
    display: none;
  }
  .toast-top {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .toast-icon {
    margin-top: 1px;
    flex-shrink: 0;
  }
  .toast-text {
    flex: 1;
    font-size: 12.5px;
    line-height: 1.45;
    color: #e0e0e0;
  }
  .toast-source {
    margin-top: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .toast-ext-label {
    font-size: 11px;
    color: #858585;
  }
  .toast-actions {
    display: flex;
    gap: 6px;
  }
  .btn {
    padding: 4px 12px;
    border-radius: 3px;
    font-size: 12px;
    color: #ffffff;
    background: #0078d4;
    border: 1px solid rgba(255,255,255,0.08);
  }
  .btn.hovered { background: #1488e0; box-shadow: 0 0 0 1px #60beff; }
  .btn.secondary {
    background: #313131;
    color: #cccccc;
  }

  /* Reload Banner */
  .reload-overlay {
    position: absolute;
    inset: 0;
    background: rgba(24, 24, 24, 0.35);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 45;
  }
  .reload-pill {
    background: #252526;
    border: 1px solid #0078d4;
    padding: 8px 16px;
    border-radius: 6px;
    color: #ffffff;
    font-size: 12.5px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Cursor */
  .cursor {
    position: absolute;
    left: 400px;
    top: 200px;
    width: 22px;
    height: 22px;
    pointer-events: none;
    z-index: 100;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.65));
  }
  .click-ripple {
    position: absolute;
    width: 28px;
    height: 28px;
    border: 2px solid #60beff;
    background: rgba(96, 190, 255, 0.25);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 99;
    display: none;
  }
</style>
</head>
<body>
  <!-- Titlebar -->
  <div class="titlebar">
    <div class="titlebar-left">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#0078d4"><path d="M17.5 0L7 9.5 2.5 6 0 7.5v9L2.5 18 7 14.5 17.5 24 24 21.5v-19L17.5 0zm0 17.5L10.5 12l7-5.5v11z"/></svg>
      <div class="titlebar-menu">
        <span>File</span><span>Edit</span><span>Selection</span><span>View</span><span>Go</span><span>Run</span><span>Terminal</span>
      </div>
    </div>
    <div class="titlebar-search">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.656a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>
      <span>my-workspace — Visual Studio Code</span>
    </div>
    <div class="win-controls">
      <span>—</span><span>▢</span><span>✕</span>
    </div>
  </div>

  <!-- Workbench -->
  <div class="workbench">
    <div class="activitybar">
      <div class="act-icon active">
        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 1h-8l-.5.5v2H2.5l-.5.5v10l.5.5h8l.5-.5v-2h2.5l.5-.5v-10l-.5-.5zM10 13H3V5h7v8zm3-3h-2V4.5l-.5-.5H6V2h7v8z"/></svg>
      </div>
      <div class="act-icon">
        <svg width="19" height="19" viewBox="0 0 16 16" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398l3.85 3.85 1.415-1.414-3.868-3.834zm-5.242.656a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>
      </div>
      <div class="act-icon">
        <svg width="19" height="19" viewBox="0 0 16 16" fill="currentColor"><path d="M12.5 10a2.5 2.5 0 0 0-2.45 2H6.5A1.5 1.5 0 0 1 5 10.5V5.95a2.5 2.5 0 1 0-1 0v4.55A2.5 2.5 0 0 0 6.5 13h3.55a2.5 2.5 0 1 0 2.45-3z"/></svg>
      </div>
      <div class="act-icon">
        <svg width="19" height="19" viewBox="0 0 16 16" fill="currentColor"><path d="M8.5 1h-7l-.5.5v7l.5.5h7l.5-.5v-7L8.5 1zM8 8H2V2h6v6zm6.5 0h-5l-.5.5v5l.5.5h5l.5-.5v-5l-.5-.5zm-.5 5h-4V9h4v4z"/></svg>
      </div>
    </div>

    <div class="sidebar">
      <div class="sidebar-header"><span>Explorer</span><span>•••</span></div>
      <div class="tree-item"><span>▾</span><strong>MY-WORKSPACE</strong></div>
      <div class="tree-item indent-1"><span>▾</span><span>src</span></div>
      <div class="tree-item indent-2 selected"><span class="ts-badge">TS</span><span>agent.ts</span></div>
      <div class="tree-item indent-2"><span class="ts-badge">TS</span><span>config.ts</span></div>
      <div class="tree-item indent-1"><span class="json-badge">{}</span><span>package.json</span></div>
      <div class="tree-item indent-1"><span class="json-badge">{}</span><span>tsconfig.json</span></div>
    </div>

    <div class="editor-area">
      <div class="tabs">
        <div class="tab active"><span class="ts-badge">TS</span><span>agent.ts</span><span>×</span></div>
        <div class="tab"><span class="json-badge">{}</span><span>package.json</span></div>
      </div>
      <div class="breadcrumbs">
        <span>src</span><span>›</span><span>agent.ts</span><span>›</span><span>initClaude</span>
      </div>
      <div class="code-canvas">
        <div class="code-line"><span class="ln">1</span><span><span class="kw">import</span> { <span class="var">Anthropic</span> } <span class="kw">from</span> <span class="str">'@anthropic-ai/sdk'</span>;</span></div>
        <div class="code-line"><span class="ln">2</span><span><span class="kw">import</span> { <span class="var">loadConfig</span> } <span class="kw">from</span> <span class="str">'./config'</span>;</span></div>
        <div class="code-line"><span class="ln">3</span><span></span></div>
        <div class="code-line"><span class="ln">4</span><span class="cmt">// Switch Claude Code accounts in 1 click</span></div>
        <div class="code-line active-line"><span class="ln">5</span><span><span class="kw">export async function</span> <span class="fn">initClaude</span>() {</span></div>
        <div class="code-line"><span class="ln">6</span><span>  <span class="kw">const</span> <span class="var">cfg</span> = <span class="kw">await</span> <span class="fn">loadConfig</span>();</span></div>
        <div class="code-line"><span class="ln">7</span><span>  <span class="kw">return new</span> <span class="typ">Anthropic</span>({ <span class="var">apiKey</span>: <span class="var">cfg</span>.<span class="var">token</span> });</span></div>
        <div class="code-line"><span class="ln">8</span><span>}</span></div>
      </div>
    </div>

    <div class="claude-panel">
      <div class="claude-header">
        <span class="claude-badge"><span class="claude-dot"></span>CLAUDE CODE</span>
        <span style="color:#858585">•••</span>
      </div>
      <div class="claude-body">
        <div class="claude-card">
          <div class="claude-card-title">Authenticated Account</div>
          <div class="claude-card-val" id="panel-email">work@company.com</div>
          <div class="claude-card-sub" id="panel-org">Organization: Acme Corp</div>
        </div>
        <div class="claude-card">
          <div class="claude-card-title">Session Status</div>
          <div style="color:#73c991;font-weight:500;">● Ready (Claude Sonnet 4.5)</div>
          <div class="claude-card-sub">OAuth credentials synced</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Status Bar -->
  <div class="statusbar">
    <div class="sb-left">
      <div class="sb-remote">&gt;&lt;</div>
      <div class="sb-item">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M12.5 10a2.5 2.5 0 0 0-2.45 2H6.5A1.5 1.5 0 0 1 5 10.5V5.95a2.5 2.5 0 1 0-1 0v4.55A2.5 2.5 0 0 0 6.5 13h3.55a2.5 2.5 0 1 0 2.45-3z"/></svg>
        <span>main*</span>
      </div>
      <div class="sb-item">
        <span>⊗ 0</span>
        <span style="margin-left:4px">⚠ 0</span>
      </div>
      <!-- CLAUDE STATUS BAR BUTTON -->
      <div class="sb-item claude-btn" id="claude-sb">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 1c-3.315 0-6 1.79-6 4v1h12v-1c0-2.21-2.685-4-6-4z"/></svg>
        <span id="claude-sb-text">Claude: Work</span>
      </div>
    </div>
    <div class="sb-right">
      <div class="sb-item">Ln 5, Col 38</div>
      <div class="sb-item">UTF-8</div>
      <div class="sb-item">TypeScript</div>
      <div class="sb-item">🔔</div>
    </div>
  </div>

  <!-- Focus Pulse Ring -->
  <div class="focus-ring" id="focus-ring"></div>

  <!-- Status Bar Tooltip -->
  <div class="sb-tooltip" id="sb-tooltip">
    <div><strong>Active Claude account:</strong> <span id="tt-name">Work</span></div>
    <div id="tt-email">work@company.com — Acme Corp</div>
    <div><em>Click to switch account (Ctrl+Alt+A)</em></div>
  </div>

  <!-- QuickPick Modal (Switch Menu) -->
  <div class="quickpick" id="qp-menu">
    <div class="qp-input-wrap">
      <div class="qp-input placeholder" id="qp-input">Choose the Claude account to use</div>
    </div>
    <div class="qp-list" id="qp-list">
      <div class="qp-row active" id="qp-row-0">
        <div class="qp-row-left">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="#75beff"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>
          <span>Work</span>
          <span class="qp-email">work@company.com</span>
        </div>
        <span class="qp-badge">Active</span>
      </div>
      <div class="qp-row" id="qp-row-1">
        <div class="qp-row-left">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 1c-3.315 0-6 1.79-6 4v1h12v-1c0-2.21-2.685-4-6-4z"/></svg>
          <span>Personal</span>
          <span class="qp-email">ares@personal.dev</span>
        </div>
      </div>
      <div class="qp-sep"></div>
      <div class="qp-row" id="qp-row-2">
        <div class="qp-row-left">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M7.5 1v6.5H1v1h6.5V15h1V8.5H15v-1H8.5V1h-1z"/></svg>
          <span>Add new account…</span>
        </div>
      </div>
      <div class="qp-row" id="qp-row-3">
        <div class="qp-row-left">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1z"/></svg>
          <span>Rename account…</span>
        </div>
      </div>
    </div>
  </div>

  <!-- QuickPick Input Box (First Setup Name Prompt) -->
  <div class="quickpick" id="qp-name">
    <div class="qp-input-wrap">
      <div class="qp-input" id="qp-name-val">work</div>
    </div>
    <div class="qp-subtext">Name for account work@company.com (Press 'Enter' to confirm or 'Escape' to cancel)</div>
  </div>

  <!-- Toast Notification -->
  <div class="toast" id="toast">
    <div class="toast-top">
      <div class="toast-icon" id="toast-icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="#3794ff"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm2 8H6v-1h1V7H6V6h3v5h1v1z"/></svg>
      </div>
      <div class="toast-text" id="toast-text">Switched to "Personal" (ares@personal.dev)</div>
    </div>
    <div class="toast-source">
      <span class="toast-ext-label">Extension: Claude Code Account Switcher</span>
      <div class="toast-actions" id="toast-actions"></div>
    </div>
  </div>

  <!-- Reload indicator -->
  <div class="reload-overlay" id="reload-overlay">
    <div class="reload-pill">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="#0078d4"><path d="M13.451 5.609l-.579-.939-1.068.812-.076.094c-.335.415-.927 1.341-1.124 2.876l-.021.165.033.163.071.345c0 1.654-1.346 3-3 3-.795 0-1.545-.311-2.107-.868-.563-.557-.873-1.302-.873-2.092 0-1.519 1.136-2.779 2.625-2.969v1.924l3.529-2.542L7.328 3v1.832C4.787 5.031 2.8 7.163 2.8 9.75c0 1.326.521 2.574 1.466 3.511.944.937 2.2 1.454 3.534 1.454 2.757 0 5-2.243 5-5 0-.311-.029-.616-.085-.913z"/></svg>
      <span>Reloading Claude Code session…</span>
    </div>
  </div>

  <!-- Click Ripple -->
  <div class="click-ripple" id="ripple"></div>

  <!-- Mouse Cursor -->
  <div class="cursor" id="cursor">
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path d="M4 2l15 11-6.5 1.2 3.2 6.8-2.6 1.2-3.2-6.8L5 19.5V2z" fill="#ffffff" stroke="#111111" stroke-width="1.6" stroke-linejoin="round"/>
    </svg>
  </div>

  <script>
    window.setState = function(s) {
      const sb = document.getElementById('claude-sb');
      const sbText = document.getElementById('claude-sb-text');
      const ring = document.getElementById('focus-ring');
      const tt = document.getElementById('sb-tooltip');
      const qpMenu = document.getElementById('qp-menu');
      const qpName = document.getElementById('qp-name');
      const qpNameVal = document.getElementById('qp-name-val');
      const toast = document.getElementById('toast');
      const toastText = document.getElementById('toast-text');
      const toastActions = document.getElementById('toast-actions');
      const cursor = document.getElementById('cursor');
      const ripple = document.getElementById('ripple');
      const reload = document.getElementById('reload-overlay');
      const panelEmail = document.getElementById('panel-email');
      const panelOrg = document.getElementById('panel-org');

      sb.className = 'sb-item claude-btn' + (s.sbWarning ? ' warning' : '') + (s.sbHover ? ' hovered' : '');
      sbText.textContent = s.sbText || 'Claude: Work';

      if (s.showRing) {
        const rect = sb.getBoundingClientRect();
        ring.style.display = 'block';
        ring.style.left = (rect.left - 3) + 'px';
        ring.style.top = (rect.top - 2) + 'px';
        ring.style.width = (rect.width + 6) + 'px';
        ring.style.height = (rect.height + 3) + 'px';
        ring.style.transform = 'scale(' + (s.ringScale || 1) + ')';
      } else {
        ring.style.display = 'none';
      }

      tt.style.display = s.showTooltip ? 'block' : 'none';

      qpMenu.style.display = s.showQpMenu ? 'block' : 'none';
      if (s.showQpMenu) {
        for (let i = 0; i < 4; i++) {
          const r = document.getElementById('qp-row-' + i);
          r.className = 'qp-row' + (s.qpActive === i ? ' active' : '');
        }
      }

      qpName.style.display = s.showQpName ? 'block' : 'none';
      if (s.qpNameText !== undefined) {
        qpNameVal.textContent = s.qpNameText;
      }

      toast.style.display = s.showToast ? 'block' : 'none';
      if (s.toastText) toastText.textContent = s.toastText;
      if (s.toastButtons) {
        toastActions.innerHTML = s.toastButtons.map((b, idx) =>
          '<div id="toast-btn-' + idx + '" class="btn ' + (b.secondary ? 'secondary ' : '') + (b.hovered ? 'hovered' : '') + '">' + b.label + '</div>'
        ).join('');
      } else {
        toastActions.innerHTML = '';
      }

      reload.style.display = s.showReload ? 'flex' : 'none';

      if (s.panelEmail) panelEmail.textContent = s.panelEmail;
      if (s.panelOrg) panelOrg.textContent = s.panelOrg;

      if (s.cursor) {
        cursor.style.left = s.cursor[0] + 'px';
        cursor.style.top = s.cursor[1] + 'px';
      }

      if (s.ripple) {
        ripple.style.display = 'block';
        ripple.style.left = s.ripple[0] + 'px';
        ripple.style.top = s.ripple[1] + 'px';
      } else {
        ripple.style.display = 'none';
      }
    };
  </script>
</body>
</html>`;

function lerp(a, b, t) {
  const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return [
    Math.round(a[0] + (b[0] - a[0]) * ease),
    Math.round(a[1] + (b[1] - a[1]) * ease)
  ];
}

async function captureGif(page, timeline, outputPath) {
  const rawFrames = [];

  for (let idx = 0; idx < timeline.length; idx++) {
    const step = timeline[idx];
    await page.evaluate(s => window.setState(s), step.state);
    const buf = await page.screenshot({ type: 'png' });
    const png = PNG.sync.read(buf);
    rawFrames.push({ rgba: png.data, delay: step.delay });
  }

  const gif = GIFEncoder();
  for (const frame of rawFrames) {
    const palette = quantize(frame.rgba, 256);
    const index = applyPalette(frame.rgba, palette);
    gif.writeFrame(index, WIDTH, HEIGHT, {
      palette,
      delay: frame.delay,
      repeat: 0
    });
  }
  gif.finish();
  fs.writeFileSync(outputPath, Buffer.from(gif.bytes()));
  console.log(`Saved ${outputPath} (${rawFrames.length} frames, ${Math.round(fs.statSync(outputPath).size / 1024)} KB)`);
}

async function centerOf(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
  }, selector);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars']
  });

  const page = await browser.newPage();
  await page.setContent(HTML_TEMPLATE, { waitUntil: 'load' });

  // Measure exact centers of interactive UI elements
  await page.evaluate(() => window.setState({
    sbText: 'Claude: Work',
    showQpMenu: true,
    showToast: true,
    toastButtons: [{ label: 'Save' }, { label: 'Later', secondary: true }]
  }));
  const sbPos = await centerOf(page, '#claude-sb');
  const qpRow0Pos = await centerOf(page, '#qp-row-0');
  const qpRow1Pos = await centerOf(page, '#qp-row-1');
  const saveBtnPos = await centerOf(page, '#toast-btn-0');

  // =========================================================================
  // GIF 1: Quick Account Switching from Status Bar
  // =========================================================================
  const timelineSwitch = [];
  const startPos = [480, 240];

  timelineSwitch.push({
    delay: 650,
    state: { sbText: 'Claude: Work', panelEmail: 'work@company.com', panelOrg: 'Organization: Acme Corp', showRing: true, ringScale: 1.0, cursor: startPos }
  });
  timelineSwitch.push({
    delay: 450,
    state: { sbText: 'Claude: Work', showRing: true, ringScale: 1.05, cursor: startPos }
  });

  for (let i = 1; i <= 5; i++) {
    timelineSwitch.push({
      delay: 70,
      state: { sbText: 'Claude: Work', showRing: true, cursor: lerp(startPos, sbPos, i / 5) }
    });
  }

  timelineSwitch.push({ delay: 550, state: { sbText: 'Claude: Work', sbHover: true, showRing: true, showTooltip: true, cursor: sbPos } });
  timelineSwitch.push({ delay: 450, state: { sbText: 'Claude: Work', sbHover: true, showTooltip: true, cursor: sbPos } });

  timelineSwitch.push({ delay: 180, state: { sbText: 'Claude: Work', sbHover: true, cursor: sbPos, ripple: sbPos } });

  timelineSwitch.push({ delay: 350, state: { sbText: 'Claude: Work', showQpMenu: true, qpActive: 0, cursor: sbPos } });

  for (let i = 1; i <= 5; i++) {
    timelineSwitch.push({
      delay: 70,
      state: { sbText: 'Claude: Work', showQpMenu: true, qpActive: 0, cursor: lerp(sbPos, qpRow0Pos, i / 5) }
    });
  }
  timelineSwitch.push({ delay: 350, state: { sbText: 'Claude: Work', showQpMenu: true, qpActive: 0, cursor: qpRow0Pos } });

  for (let i = 1; i <= 3; i++) {
    timelineSwitch.push({
      delay: 85,
      state: { sbText: 'Claude: Work', showQpMenu: true, qpActive: i >= 2 ? 1 : 0, cursor: lerp(qpRow0Pos, qpRow1Pos, i / 3) }
    });
  }
  timelineSwitch.push({ delay: 550, state: { sbText: 'Claude: Work', showQpMenu: true, qpActive: 1, cursor: qpRow1Pos } });

  timelineSwitch.push({ delay: 180, state: { sbText: 'Claude: Work', showQpMenu: true, qpActive: 1, cursor: qpRow1Pos, ripple: qpRow1Pos } });

  timelineSwitch.push({ delay: 420, state: { sbText: 'Claude: Personal', showReload: true, panelEmail: 'ares@personal.dev', panelOrg: 'Personal Account', cursor: qpRow1Pos } });

  timelineSwitch.push({
    delay: 1900,
    state: {
      sbText: 'Claude: Personal',
      showRing: true,
      panelEmail: 'ares@personal.dev',
      panelOrg: 'Personal Account',
      showToast: true,
      toastText: 'Claude account: Personal (ares@personal.dev)',
      cursor: [520, 260]
    }
  });

  const outSwitch = path.resolve(__dirname, '../docs/images/quick-switch.gif');
  await captureGif(page, timelineSwitch, outSwitch);

  // =========================================================================
  // GIF 2: First-Time Configuration & Saving Detected Account
  // =========================================================================
  const timelineSetup = [];
  const initCursor = [420, 240];
  const inputCursorPos = [440, 62];

  const unsavedToast = 'Claude account not saved yet: work@company.com. Save it so you can switch back with one click?';
  const buttonsIdle = [{ label: 'Save', hovered: false }, { label: 'Later', secondary: true }];
  const buttonsHover = [{ label: 'Save', hovered: true }, { label: 'Later', secondary: true }];

  timelineSetup.push({
    delay: 950,
    state: {
      sbText: 'Claude: work@company.com',
      sbWarning: true,
      showRing: true,
      panelEmail: 'work@company.com',
      panelOrg: 'Organization: Acme Corp',
      showToast: true,
      toastText: unsavedToast,
      toastButtons: buttonsIdle,
      cursor: initCursor
    }
  });

  for (let i = 1; i <= 5; i++) {
    timelineSetup.push({
      delay: 75,
      state: {
        sbText: 'Claude: work@company.com',
        sbWarning: true,
        panelEmail: 'work@company.com',
        panelOrg: 'Organization: Acme Corp',
        showToast: true,
        toastText: unsavedToast,
        toastButtons: i === 5 ? buttonsHover : buttonsIdle,
        cursor: lerp(initCursor, saveBtnPos, i / 5)
      }
    });
  }
  timelineSetup.push({
    delay: 480,
    state: {
      sbText: 'Claude: work@company.com',
      sbWarning: true,
      panelEmail: 'work@company.com',
      panelOrg: 'Organization: Acme Corp',
      showToast: true,
      toastText: unsavedToast,
      toastButtons: buttonsHover,
      cursor: saveBtnPos
    }
  });

  timelineSetup.push({
    delay: 180,
    state: {
      sbText: 'Claude: work@company.com',
      sbWarning: true,
      panelEmail: 'work@company.com',
      panelOrg: 'Organization: Acme Corp',
      showToast: true,
      toastText: unsavedToast,
      toastButtons: buttonsHover,
      cursor: saveBtnPos,
      ripple: saveBtnPos
    }
  });

  const typingSteps = ['work', '', 'W', 'Wo', 'Wor', 'Work'];
  for (const txt of typingSteps) {
    timelineSetup.push({
      delay: txt === 'Work' ? 680 : 160,
      state: {
        sbText: 'Claude: work@company.com',
        sbWarning: true,
        panelEmail: 'work@company.com',
        panelOrg: 'Organization: Acme Corp',
        showQpName: true,
        qpNameText: txt + '▏',
        cursor: inputCursorPos
      }
    });
  }

  timelineSetup.push({
    delay: 1950,
    state: {
      sbText: 'Claude: Work',
      sbWarning: false,
      showRing: true,
      panelEmail: 'work@company.com',
      panelOrg: 'Organization: Acme Corp',
      showToast: true,
      toastText: 'Account "Work" saved. Click the status bar anytime to switch or add another account.',
      cursor: [480, 250]
    }
  });

  const outSetup = path.resolve(__dirname, '../docs/images/first-setup.gif');
  await captureGif(page, timelineSetup, outSetup);

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
