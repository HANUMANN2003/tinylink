import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// ======================
// DATABASE (pure JS sqlite)
// ======================
let db;

(async () => {
  db = await open({
    filename: "links.db",
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS links(
      code TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      clicks INTEGER DEFAULT 0,
      last_clicked TEXT
    )
  `);

  console.log("Database ready");
})();

// ======================
app.get("/healthz", (req, res) => {
  res.json({ ok: true, version: "1.0" });
});

// Create short link
app.post("/api/links", async (req, res) => {
  const { url, code } = req.body;

  if (!url || !code) return res.status(400).json({ error: "Missing fields" });

  try {
    await db.run(
      "INSERT INTO links (code, url) VALUES (?, ?)",
      code,
      url
    );
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: "Code exists" });
  }
});

// List all links
app.get("/api/links", async (req, res) => {
  const rows = await db.all("SELECT * FROM links");
  res.json(rows);
});

// Get one link
app.get("/api/links/:code", async (req, res) => {
  const row = await db.get("SELECT * FROM links WHERE code = ?", req.params.code);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

// Delete
app.delete("/api/links/:code", async (req, res) => {
  await db.run("DELETE FROM links WHERE code = ?", req.params.code);
  res.json({ ok: true });
});

// Stats page (before redirect)
app.get("/code/:code", (req, res) => {
  res.sendFile(path.join(__dirname, "stats.html"));
});

// Redirect
app.get("/:code", async (req, res) => {
  const row = await db.get("SELECT * FROM links WHERE code = ?", req.params.code);

  if (!row) return res.status(404).send("Not found");

  await db.run(
    `UPDATE links 
     SET clicks = clicks + 1, last_clicked = datetime('now')
     WHERE code = ?`,
    req.params.code
  );

  res.redirect(302, row.url);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running on " + PORT));
