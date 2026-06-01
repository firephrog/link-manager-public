'use strict';

const path = require('path');
const { google } = require('googleapis');
const config = require('./config');

const DOC_URL = config.PAGES.grapplegame.googledoc;
const docId = DOC_URL.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)[1];

(async () => {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'secret', 'credentials.json'),
    scopes: ['https://www.googleapis.com/auth/documents.readonly'],
  });
  const docs = google.docs({ version: 'v1', auth: await auth.getClient() });
  const doc = await docs.documents.get({ documentId: docId });

  console.log('--- DOC TITLE ---');
  console.log(doc.data.title);
  console.log('--- DOC BODY (all structural + paragraph elements) ---');
  const walk = (elements, depth = 0) => {
    const pad = '  '.repeat(depth);
    for (const el of elements || []) {
      const kind = Object.keys(el).find(k => k !== 'startIndex' && k !== 'endIndex');
      console.log(`${pad}[${el.startIndex}-${el.endIndex}] STRUCT:${kind}`);
      if (el.paragraph) {
        for (const pe of el.paragraph.elements || []) {
          const k = Object.keys(pe).find(k => k !== 'startIndex' && k !== 'endIndex');
          const sample = JSON.stringify(pe[k]).slice(0, 250);
          console.log(`${pad}  [${pe.startIndex}-${pe.endIndex}] ${k}: ${sample}`);
        }
      } else if (el.table) {
        for (const row of el.table.tableRows || []) {
          for (const cell of row.tableCells || []) {
            walk(cell.content, depth + 1);
          }
        }
      }
    }
  };
  walk(doc.data.body.content);

  if (doc.data.inlineObjects) {
    console.log('--- INLINE OBJECTS ---');
    console.log(JSON.stringify(Object.keys(doc.data.inlineObjects)));
  }
})().catch(err => console.error('ERR:', err.message));
