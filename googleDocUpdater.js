'use strict';

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const CRED_PATH = path.join(__dirname, 'secret', 'credentials.json');
const STATE_PATH = path.join(__dirname, 'doc-state.json');
const SCOPES = ['https://www.googleapis.com/auth/documents'];
const SLOTS = 3;

let docsClientPromise = null;

function getDocs() {
  if (!docsClientPromise) {
    const auth = new google.auth.GoogleAuth({
      keyFile: CRED_PATH,
      scopes: SCOPES,
    });
    docsClientPromise = auth.getClient().then(authClient =>
      google.docs({ version: 'v1', auth: authClient })
    );
  }
  return docsClientPromise;
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return {}; }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function extractDocId(url) {
  const m = url && url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
}

function buildValues(page, segments) {
  const active = segments
    .filter(s => !s.expiresAt || s.expiresAt > Date.now())
    .sort((a, b) => (a.id || 0) - (b.id || 0));
  const values = {};
  values['<TITLE>'] = page.title || '(no title)';
  for (let i = 1; i <= SLOTS; i++) {
    const s = active[i - 1];
    values[`<LINK_${i}>`] = s ? s.url : `(link ${i} pending)`;
    values[`<EXPIRE_TIME_${i}>`] = s && s.expiresAt ? formatTime(s.expiresAt) : `(no expiry ${i})`;
    values[`<CREATION_TIME_${i}>`] = s ? formatTime(s.id) : `(no creation time ${i})`;
  }
  return values;
}

function findTextRanges(content, search) {
  const ranges = [];
  const walk = (elements) => {
    for (const el of elements || []) {
      if (el.paragraph) {
        for (const pe of el.paragraph.elements || []) {
          if (pe.textRun && pe.textRun.content) {
            const text = pe.textRun.content;
            let idx = 0;
            while ((idx = text.indexOf(search, idx)) !== -1) {
              ranges.push({
                startIndex: pe.startIndex + idx,
                endIndex: pe.startIndex + idx + search.length,
              });
              idx += search.length;
            }
          }
        }
      } else if (el.table) {
        for (const row of el.table.tableRows || []) {
          for (const cell of row.tableCells || []) {
            walk(cell.content);
          }
        }
      }
    }
  };
  walk(content);
  return ranges;
}

async function updateDoc(page, segments) {
  const docId = extractDocId(page.googledoc);
  if (!docId) return;

  const docs = await getDocs();
  const state = loadState();
  const prev = state[docId] || {};
  const next = buildValues(page, segments);

  const requests = [];
  for (const placeholder of Object.keys(next)) {
    const newValue = next[placeholder];
    const prevValue = prev[placeholder];

    // Replace the original placeholder if it's still present (first run or template reset).
    if (placeholder !== newValue) {
      requests.push({
        replaceAllText: {
          containsText: { text: placeholder, matchCase: true },
          replaceText: newValue,
        },
      });
    }
    // Replace whatever value we previously substituted in.
    if (prevValue && prevValue !== placeholder && prevValue !== newValue) {
      requests.push({
        replaceAllText: {
          containsText: { text: prevValue, matchCase: true },
          replaceText: newValue,
        },
      });
    }
  }

  if (requests.length > 0) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests },
    });
  }

  // Style pass: mark each link URL as a clickable hyperlink with white text.
  const doc = await docs.documents.get({ documentId: docId });
  const body = doc.data.body;
  const white = { color: { rgbColor: { red: 1, green: 1, blue: 1 } } };

  const styleRequests = [];
  for (let i = 1; i <= SLOTS; i++) {
    const url = next[`<LINK_${i}>`];
    if (!url || !url.startsWith('http')) continue;
    for (const range of findTextRanges(body.content, url)) {
      styleRequests.push({
        updateTextStyle: {
          range,
          textStyle: { link: { url }, foregroundColor: white },
          fields: 'link,foregroundColor',
        },
      });
    }
  }

  if (styleRequests.length > 0) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests: styleRequests },
    });
  }

  state[docId] = next;
  saveState(state);
}

module.exports = { updateDoc };
