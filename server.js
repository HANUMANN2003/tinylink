import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

// Required for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// ======================
// DATABASE (better-sqlite3)
// ======================
const db = new Database("links.db");

// Create table if not exists
db.prepare(`
  CREATE TABLE IF NOT EXISTS links(
    code TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    clicks INTEGER DEFAULT 0,
    last_clicked TEXT
  )
`).run();

// ======================
// HEALTH CHECK
// ======================
app.get("/healthz", (req, res) => {
  res.json({ ok: true, version: "1.0" });
});

// ======================
// API ROUTES
// ======================

// Create short link
app.post("/api/links", (req, res) => {
  const { url, code } = req.body;

  if (!url || !code) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    db.prepare("INSERT INTO links (code, url) VALUES (?, ?)").run(code, url);
    res.json({ ok: true });
  } catch (e) {
    res.status(409).json({ error: "Code exists" });
  }
});

// List all links
app.get("/api/links", (req, res) => {
  const rows = db.prepare("SELECT * FROM links").all();
  res.json(rows);
});

// Get single link
app.get("/api/links/:code", (req, res) => {
  const code = req.params.code;
  const row = db.prepare("SELECT * FROM links WHERE code = ?").get(code);

  if (!row) return res.status(404).json({ error: "Not found" });

  res.json(row);
});

// Delete a link
app.delete("/api/links/:code", (req, res) => {
  db.prepare("DELETE FROM links WHERE code = ?").run(req.params.code);
  res.json({ ok: true });
});

// ======================
// STATS PAGE (must be before redirect)
// ======================
app.get("/code/:code", (req, res) => {
  res.sendFile(path.join(__dirname, "stats.html"));
});

// ======================
// REDIRECT SHORT LINK (must be last)
// ======================
app.get("/:code", (req, res) => {
  const code = req.params.code;

  const row = db.prepare("SELECT * FROM links WHERE code = ?").get(code);
  if (!row) return res.status(404).send("Not found");

  db.prepare(`
    UPDATE links 
    SET clicks = clicks + 1, last_clicked = datetime('now')
    WHERE code = ?
  `).run(code);

  res.redirect(302, row.url);
});

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running on " + PORT));
