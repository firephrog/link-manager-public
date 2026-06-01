'use strict';

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { updateDoc } = require('./googleDocUpdater');

const DOC_UPDATE_INTERVAL_MS = 60000;

function runGoogleDocUpdates() {
  const data = readData();
  for (const [section, page] of Object.entries(config.PAGES)) {
    if (page.type !== 'cycling' || !page.googledoc) continue;
    const segments = data[section] || [];
    updateDoc(page, segments).catch(err => {
      console.error(`[${section}] Google Doc update failed: ${err.message}`);
    });
  }
}

const app = express();
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'data.json');

// Tracks running cloudflare tunnel processes per section
const runningTunnels = {};
// Tracks last successful generation timestamp globally
let lastGeneratedGlobal = undefined;
// Tracks active cycling regeneration timers
const cyclingTimers = {};

function readData() {
  let data = {};
  if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  // Ensure every page from config has an entry
  let changed = false;
  for (const key of Object.keys(config.PAGES)) {
    if (!data[key]) {
      data[key] = [];
      changed = true;
    }
  }
  if (changed) writeData(data);
  return data;
}

// Generate a single tunnel URL and store it with expiration
function generateTunnelForSection(section, durationMs = 10800000) {
  return new Promise((resolve, reject) => {
    const page = config.PAGES[section];
    if (!page) {
      reject(new Error('Page not found'));
      return;
    }

    const cmd = 'cloudflared';
    const args = ['tunnel', '--url', `localhost:${page.port}`];
    let proc;
    try {
      proc = spawn(cmd, args, { shell: true });
    } catch (err) {
      reject(err);
      return;
    }

    let urlFound = false;
    const urlRegex = /https:\/\/[\w-]+\.trycloudflare\.com/;
    let output = '';

    const handleOutput = (chunk) => {
      output += chunk.toString();
      const lines = output.split(/\r?\n/);
      output = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        console.log(`[${section}] ${line}`);
        if (!urlFound) {
          const match = line.match(urlRegex);
          if (match) {
            urlFound = true;
            const url = match[0];
            const expiresAt = Date.now() + durationMs;
            const data = readData();
            if (!data[section]) data[section] = [];
            data[section].push({
              id: Date.now(),
              url,
              label: new Date().toLocaleString(),
              expiresAt,
              active: true
            });
            writeData(data);
            console.log(`[${section}] URL generated: ${url} (expires in ${durationMs / 3600000}h)`);
            proc.kill();
            resolve({ url, expiresAt });
          }
        }
      }
    };

    proc.stdout.on('data', handleOutput);
    proc.stderr.on('data', handleOutput);

    const timer = setTimeout(() => {
      if (!urlFound) {
        console.log(`[${section}] Timed out after 30s`);
        try { proc.kill(); } catch (_) {}
        reject(new Error('Timeout waiting for tunnel URL'));
      }
    }, 30000);

    proc.on('close', () => {
      clearTimeout(timer);
      if (!urlFound) {
        reject(new Error('Process closed without URL'));
      }
    });

    proc.on('error', reject);
  });
}

// Auto-generate cycling links with staggered durations
function setupCyclingLinks(section) {
  if (cyclingTimers[section]) clearTimeout(cyclingTimers[section]);

  const durations = [10800000, 7200000, 3600000]; // 3h, 2h, 1h
  let generated = 0;

  const generateNext = async () => {
    try {
      const duration = durations[generated];
      console.log(`[${section}] Generating cycling link ${generated + 1}/3 (${duration / 3600000}h)`);
      await generateTunnelForSection(section, duration);
      generated++;

      if (generated < 3) {
        generateNext();
      } else {
        console.log(`[${section}] All 3 cycling links generated. Next batch in 3 hours.`);
        // Schedule next regeneration in 3 hours
        cyclingTimers[section] = setTimeout(() => setupCyclingLinks(section), 10800000);
      }
    } catch (err) {
      console.error(`[${section}] Error generating cycling link: ${err.message}`);
      // Retry in 5 seconds
      cyclingTimers[section] = setTimeout(generateNext, 5000);
    }
  };

  generateNext();
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// GET /api/pages — return all page configs merged with persisted segments
app.get('/api/pages', (req, res) => {
  const data = readData();
  const result = {};
  const now = Date.now();
  for (const [key, pageConfig] of Object.entries(config.PAGES)) {
    let segments = data[key] || [];
    // Filter out expired segments
    segments = segments.filter(seg => !seg.expiresAt || seg.expiresAt > now);
    result[key] = {
      ...pageConfig,
      section: key,
      segments,
    };
  }
  res.json(result);
});

// GET /api/pages/:section/generate — SSE stream of tunnel progress + URL
app.get('/api/pages/:section/generate', (req, res) => {
  const { section } = req.params;
  const page = config.PAGES[section];
  if (!page) { res.status(404).json({ error: 'Page not found' }); return; }
  if (page.type === 'static') { res.status(400).json({ error: 'Cannot generate static links' }); return; }

  // Cooldown check — send as SSE so EventSource handles it
  const cooldown = config.COOLDOWN_MS ?? 3600000;
  const last = lastGeneratedGlobal;
  if (last !== undefined) {
    const elapsed = Date.now() - last;
    if (elapsed < cooldown) {
      const remaining = Math.ceil((cooldown - elapsed) / 1000);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.write(`data: ${JSON.stringify({ type: 'error', message: `Cooldown active — wait ${remaining}s before generating again.` })}

`);
      res.end();
      return;
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (obj) => {
    if (res.writableEnded) return;
    const line = `data: ${JSON.stringify(obj)}\n\n`;
    process.stdout.write(`[SSE→${section}] ${JSON.stringify(obj)}\n`);
    res.write(line);
  };

  // Kill any existing tunnel for this section
  if (runningTunnels[section]) {
    try { runningTunnels[section].kill(); } catch (_) {}
    delete runningTunnels[section];
    send({ type: 'log', text: 'Killed previous tunnel process.' });
  }

  // 'cloudflared' is the actual binary name for Cloudflare Tunnel
  const cmd = 'cloudflared';
  const args = ['tunnel', '--url', `localhost:${page.port}`];
  console.log(`[${section}] Spawning: ${cmd} ${args.join(' ')}`);
  send({ type: 'log', text: `Spawning: ${cmd} ${args.join(' ')}` });

  let proc;
  try {
    proc = spawn(cmd, args, { shell: true });
  } catch (err) {
    send({ type: 'error', message: `Failed to spawn process: ${err.message}` });
    res.end();
    return;
  }

  runningTunnels[section] = proc;

  let urlFound = false;
  const urlRegex = /https:\/\/[\w-]+\.trycloudflare\.com/;

  const handleOutput = (chunk) => {
    const text = chunk.toString().trim();
    if (!text) return;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      console.log(`[${section}] ${line}`);
      send({ type: 'log', text: line });
      if (!urlFound) {
        const match = line.match(urlRegex);
        if (match) {
          urlFound = true;
          const url = match[0];
          const stored = readData();
          if (!stored[section]) stored[section] = [];
          stored[section].push({ id: Date.now(), url, label: new Date().toLocaleString() });
          writeData(stored);
          lastGeneratedGlobal = Date.now();
          console.log(`[${section}] URL found: ${url}`);
          send({ type: 'url', url });
          res.end();
        }
      }
    }
  };

  proc.stdout.on('data', handleOutput);
  proc.stderr.on('data', handleOutput);

  proc.on('error', (err) => {
    console.error(`[${section}] Error: ${err.message}`);
    send({ type: 'error', message: `Failed to start tunnel: ${err.message}` });
    res.end();
  });

  proc.on('close', (code) => {
    clearTimeout(timer);
    if (!urlFound) {
      console.log(`[${section}] Process closed (code ${code}) without URL`);
      send({ type: 'error', message: `Process exited (code ${code}) without producing a tunnel URL` });
      res.end();
    }
  });

  const timer = setTimeout(() => {
    if (!urlFound) {
      console.log(`[${section}] Timed out after 30s`);
      send({ type: 'error', message: 'Timed out waiting for tunnel URL (30s)' });
      res.end();
      try { proc.kill(); } catch (_) {}
    }
  }, 30000);

  res.on('close', () => {
    clearTimeout(timer);
    if (!urlFound) {
      try { proc.kill(); } catch (_) {}
      delete runningTunnels[section];
    }
  });
});

// DELETE /api/pages/:section/segments/:id — remove a segment
app.delete('/api/pages/:section/segments/:id', (req, res) => {
  const { section, id } = req.params;
  const data = readData();
  if (!data[section]) return res.status(404).json({ error: 'Page not found' });
  data[section] = data[section].filter(s => s.id !== Number(id));
  writeData(data);
  res.json({ ok: true });
});

// In production (after `npm run build`), serve the built frontend
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(config.PORT, () => {
  // Clear all segments on startup
  const empty = {};
  for (const key of Object.keys(config.PAGES)) empty[key] = [];
  writeData(empty);
  console.log('Segments cleared on startup.');
  
  // Initialize cycling links for pages with cycling type
  for (const [section, page] of Object.entries(config.PAGES)) {
    if (page.type === 'cycling') {
      console.log(`[${section}] Starting cycling link generation (3 links with staggered durations)...`);
      setupCyclingLinks(section);
    }
  }
  
  console.log(`API server running on http://localhost:${config.PORT}`);

  // Periodically push current state to any configured Google Docs.
  runGoogleDocUpdates();
  setInterval(runGoogleDocUpdates, DOC_UPDATE_INTERVAL_MS);
});
