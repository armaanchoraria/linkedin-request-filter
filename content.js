const SAFETY = { MIN_MS: 2000, MAX_MS: 6000, CAP: 25, SCROLL_PAUSE: 2500 };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randDelay() { return SAFETY.MIN_MS + Math.random() * (SAFETY.MAX_MS - SAFETY.MIN_MS); }

function getMutuals(text) {
  const m = text.match(/(\d+)\s+other mutual/i);
  if (m) return parseInt(m[1]) + 1;
  if (/\bmutual connection\b/i.test(text)) return 1;
  return 0;
}

function getMatchReason(cardText, keywords, minMutual) {
  const lower = cardText.toLowerCase();
  const kw = keywords.find(k => lower.includes(k));
  const mutuals = getMutuals(lower);
  if (kw) return `keyword: ${kw}`;
  if (minMutual > 0 && mutuals >= minMutual) return `${mutuals} mutuals`;
  return null;
}

function getCard(btn) {
  return btn.closest('li') || btn.parentElement?.parentElement?.parentElement;
}

function getAcceptButtons() {
  return [...document.querySelectorAll('button')].filter(b => {
    const t = b.innerText.trim();
    return t === 'Accept' || t === 'Accept connection';
  });
}

function getName(card) {
  const lines = (card?.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
  return lines[0] || 'Unknown';
}

function getHeadline(card) {
  const lines = (card?.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
  return lines[1] || '';
}

// PREVIEW — no clicking, just scan
function runPreview(keywords, minMutual) {
  const buttons = getAcceptButtons();
  const matches = [];
  buttons.forEach(btn => {
    const card = getCard(btn);
    if (!card) return;
    const reason = getMatchReason(card.innerText, keywords, minMutual);
    if (reason) matches.push({ name: getName(card), headline: getHeadline(card), reason });
  });
  return { matches, totalVisible: buttons.length };
}

// ACCEPT — clicks with safe delays
async function runAccept(keywords, minMutual, notify) {
  const processed = new Set();
  let accepted = 0;
  let running = true;

  while (running) {
    const buttons = getAcceptButtons().filter(b => !processed.has(b));
    for (const btn of buttons) {
      if (accepted >= SAFETY.CAP) {
        notify(`Session cap of ${SAFETY.CAP} reached. Take a break first.`, true);
        return accepted;
      }
      processed.add(btn);
      const card = getCard(btn);
      if (!card) continue;
      if (getMatchReason(card.innerText, keywords, minMutual)) {
        await sleep(randDelay());
        btn.click();
        accepted++;
        notify(`Accepted ${accepted}…`);
      }
    }
    const prevH = document.body.scrollHeight;
    window.scrollBy(0, 900);
    await sleep(SAFETY.SCROLL_PAUSE);
    const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 300;
    if (atBottom || document.body.scrollHeight === prevH) running = false;
  }
  return accepted;
}

// IGNORE ALL
async function runIgnore(notify) {
  let ignored = 0;
  const btns = [...document.querySelectorAll('button')].filter(b => {
    const t = b.innerText.trim();
    return t === 'Ignore' || t === 'Decline';
  });
  for (const btn of btns) {
    await sleep(randDelay());
    btn.click();
    ignored++;
    notify(`Ignored ${ignored}…`);
  }
  return ignored;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  function notify(text, done = false) {
    chrome.runtime.sendMessage({ type: 'progress', text, done }).catch(() => {});
  }

  if (msg.action === 'preview') {
    sendResponse(runPreview(msg.keywords, msg.minMutual));
    return false;
  }
  if (msg.action === 'accept') {
    runAccept(msg.keywords, msg.minMutual, notify).then(n => {
      notify(`✅ Done! Accepted ${n} this session.`, true);
      sendResponse({ ok: true, n });
    });
    return true;
  }
  if (msg.action === 'ignore') {
    runIgnore(notify).then(n => {
      notify(`✅ Done! Ignored ${n} requests.`, true);
      sendResponse({ ok: true, n });
    });
    return true;
  }
});
