const KEYS = { KW: 'lrf_kw', MM: 'lrf_mm' };
const DEFAULTS = { KW: 'founder, co-founder, VC, angel, YC, a16z, sequoia', MM: 30 };
const COLORS = [
  { bg:'#0a3060', fg:'#4da3ff' }, { bg:'#003320', fg:'#30d158' },
  { bg:'#2d1a4a', fg:'#bf5af2' }, { bg:'#3a1a00', fg:'#ff9f0a' },
  { bg:'#1a2a00', fg:'#a3d158' },
];

const $ = id => document.getElementById(id);
let mutuals = DEFAULTS.MM;

function initials(name) {
  return (name || '').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase() || '?';
}
function esc(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function setStatus(text, type) {
  const el = $('status');
  el.textContent = text; el.className = type; el.style.display = 'block';
}
function hideStatus() { $('status').style.display = 'none'; }
function setDisabled(v) {
  ['previewBtn','acceptBtn','ignoreBtn'].forEach(id => { if($(id)) $(id).disabled = v; });
}

// Load saved settings — always clear MM so fresh start uses default 30
chrome.storage.sync.get([KEYS.KW, KEYS.MM], data => {
  $('keywords').value = data[KEYS.KW] ?? DEFAULTS.KW;
  mutuals = data[KEYS.MM] ?? DEFAULTS.MM;
  $('sval').textContent = mutuals;
});

$('keywords').addEventListener('input', () => {
  chrome.storage.sync.set({ [KEYS.KW]: $('keywords').value });
});

function updateMutuals(v) {
  mutuals = Math.max(0, Math.min(500, v));
  $('sval').textContent = mutuals;
  chrome.storage.sync.set({ [KEYS.MM]: mutuals });
}
$('sdown').addEventListener('click', () => updateMutuals(mutuals - 5));
$('sup').addEventListener('click',   () => updateMutuals(mutuals + 5));

// Progress from content.js
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'progress') {
    setStatus(msg.text, msg.done ? 'success' : 'info');
    if (msg.done) setDisabled(false);
  }
});

async function activeTab() {
  const [t] = await chrome.tabs.query({ active:true, currentWindow:true });
  return t;
}
function isInvitePage(url) {
  return url && url.includes('linkedin.com/mynetwork/invitation-manager');
}
function getFilters() {
  const keywords = $('keywords').value.split(',').map(k=>k.trim().toLowerCase()).filter(Boolean);
  return { keywords, minMutual: mutuals };
}

// PREVIEW
$('previewBtn').addEventListener('click', async () => {
  const tab = await activeTab();
  if (!isInvitePage(tab?.url)) {
    setStatus('Go to your LinkedIn invitations page first, then click Preview.', 'warn');
    return;
  }
  const { keywords, minMutual } = getFilters();
  if (!keywords.length && minMutual === 0) {
    setStatus('Add at least one keyword or set mutuals above 0.', 'warn');
    return;
  }
  hideStatus();
  $('previewBtn').disabled = true;

  chrome.tabs.sendMessage(tab.id, { action:'preview', keywords, minMutual }, result => {
    $('previewBtn').disabled = false;
    if (!result) {
      setStatus('Could not read the page. Make sure you are on the LinkedIn invitations page and reload that tab, then try again.', 'warn');
      return;
    }
    const { matches, totalVisible } = result;
    $('rcount').textContent = matches.length;
    $('rof').textContent = `of ${totalVisible} visible`;
    $('acceptBtn').textContent = `✓ Accept ${matches.length}`;

    const list = $('plist');
    list.innerHTML = '';
    if (!matches.length) {
      list.innerHTML = '<div class="pempty">No matches on this page.<br>Adjust keywords or scroll LinkedIn first.</div>';
    } else {
      matches.forEach(({ name, headline, reason }, i) => {
        const c = COLORS[i % COLORS.length];
        const tag = reason.replace('keyword: ','');
        const div = document.createElement('div');
        div.className = 'pitem';
        div.innerHTML = `
          <div class="avatar" style="background:${c.bg};color:${c.fg}">${esc(initials(name))}</div>
          <div class="pinfo">
            <div class="pname">${esc(name)}</div>
            ${headline ? `<div class="phl">${esc(headline)}</div>` : ''}
          </div>
          <span class="ptag">${esc(tag)}</span>`;
        list.appendChild(div);
      });
    }
    $('previewPanel').style.display = 'block';
  });
});

// ACCEPT
$('acceptBtn').addEventListener('click', async () => {
  const tab = await activeTab();
  const { keywords, minMutual } = getFilters();
  const n = parseInt($('rcount').textContent);
  if (!confirm(`Accept ${n} matching request${n!==1?'s':''}?`)) return;
  $('previewPanel').style.display = 'none';
  setStatus('Running — keep this open…', 'info');
  setDisabled(true);
  chrome.tabs.sendMessage(tab.id, { action:'accept', keywords, minMutual });
});

// IGNORE
$('ignoreBtn').addEventListener('click', async () => {
  const tab = await activeTab();
  if (!isInvitePage(tab?.url)) {
    setStatus('Go to your LinkedIn invitations page first.', 'warn');
    return;
  }
  if (!confirm('Ignore ALL remaining visible requests? This cannot be undone.')) return;
  $('previewPanel').style.display = 'none';
  setStatus('Ignoring requests…', 'info');
  setDisabled(true);
  chrome.tabs.sendMessage(tab.id, { action:'ignore' });
});
