'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { updateDoc } = require('./googleDocUpdater');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));

(async () => {
  for (const [section, page] of Object.entries(config.PAGES)) {
    if (page.type !== 'cycling' || !page.googledoc) continue;
    const segments = data[section] || [];
    console.log(`[${section}] running update with ${segments.length} segments…`);
    try {
      await updateDoc(page, segments);
      console.log(`[${section}] done`);
    } catch (err) {
      console.error(`[${section}] FAILED:`, err.message);
      if (err.response && err.response.data) {
        console.error('Response:', JSON.stringify(err.response.data, null, 2));
      }
      if (err.errors) console.error('Errors:', JSON.stringify(err.errors, null, 2));
    }
  }
})();
