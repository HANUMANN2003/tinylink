import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(express.json());
app.use(cors());

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Database setup
let db;
(async () => {
  db = await open({
    filename: 'links.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS links (
      code TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      clicks INTEGER DEFAULT 0,
      last_clicked TEXT
    )
  `);
})();

// Health check
app.get('/healthz', (req, res) => {
  res.json({ ok: true, version: "1.0" });
});

// Create short link
app.post('/api/links', async (req, res) => {
  const { url, code } = req.body;

  if (!url || !code) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    await db.run(
      'INSERT INTO links (code, url) VALUES (?, ?)',
      [code, url]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(409).json({ error: "Code exists" });
  }
});

// Get all links
app.get('/api/links', async (req, res) => {
  const links = await db.all('SELECT * FROM links');
  res.json(links);
});

// Get single link stats
app.get('/api/links/:code', async (req, res) => {
  const link = await db.get(
    'SELECT * FROM links WHERE code = ?',
    [req.params.code]
  );

  if (!link) {
    return res.status(404).json({ error: "Not found" });
  }

  res.json(link);
});

// Delete a link
app.delete('/api/links/:code', async (req, res) => {
  await db.run(
    'DELETE FROM links WHERE code = ?',
    [req.params.code]
  );

  res.json({ ok: true });
});

// STATS PAGE ROUTE (IMPORTANT: must be BEFORE redirect)
app.get('/code/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'stats.html'));
});

// REDIRECT ROUTE (MUST BE LAST)
app.get('/:code', async (req, res) => {
  const code = req.params.code;

  const link = await db.get(
    'SELECT * FROM links WHERE code = ?',
    [code]
  );

  if (!link) {
    return res.status(404).send("Not found");
  }

  await db.run(
    'UPDATE links SET clicks = clicks + 1, last_clicked = datetime("now") WHERE code = ?',
    [code]
  );

  res.redirect(302, link.url);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on ${PORT}`));
