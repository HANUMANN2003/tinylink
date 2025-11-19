import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import sqlite3 from "sqlite3";
import { open } from "sqlite";

// Convert import.meta.url to __dirname (for ESM)
const __filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Serve static files (index.html, stats.html, etc.)
app.use(express.static(__dirname));

// ======================
// DATABASE (SQLite)
// ======================
let db;

async function initDb() {
  db = await open({
    filename: path.join(__dirname, "links.db"),
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
}

// ======================
// ROUTES
// ======================

// Health check
app.get("/healthz", (req, res) => {
  res.json({ ok: true, version: "1.0" });
});

// Dashboard page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Stats page
app.get("/code/:code", (req, res) => {
  res.sendFile(path.join(__dirname, "stats.html"));
});

// Create short link
app.post("/api/links", async (req, res) => {
  try {
    const { url, code } = req.body;

    if (!url || !code) {
      return res.status(400).json({ error: "Missing fields" });
    }

    await db.run(
      "INSERT INTO links (code, url) VALUES (?, ?)",
      code,
      url
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("Error inserting link:", error);
    // Unique key error (code already exists)
    if (error && error.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      return res.status(409).json({ error: "Code exists" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// List all links
app.get("/api/links", async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM links ORDER BY rowid DESC");
    res.json(rows);
  } catch (error) {
    console.error("Error listing links:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get one link details
app.get("/api/links/:code", async (req, res) => {
  try {
    const row = await db.get("SELECT * FROM links WHERE code = ?", req.params.code);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (error) {
    console.error("Error fetching link:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete link
app.delete("/api/links/:code", async (req, res) => {
  try {
    await db.run("DELETE FROM links WHERE code = ?", req.params.code);
    res.json({ ok: true });
  } catch (error) {
    console.error("Error deleting link:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Redirect (this MUST be last so it doesn't catch other routes)
app.get("/:code", async (req, res) => {
  try {
    const row = await db.get("SELECT * FROM links WHERE code = ?", req.params.code);

    if (!row) return res.status(404).send("Not found");

    await db.run(
      `
        UPDATE links 
        SET clicks = clicks + 1, last_clicked = datetime('now')
        WHERE code = ?
      `,
      req.params.code
    );

    res.redirect(302, row.url);
  } catch (error) {
    console.error("Error redirecting:", error);
    res.status(500).send("Internal server error");
  }
});

// ======================
// START SERVER
// ======================

async function start() {
  try {
    await initDb();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(TinyLink server running on port ${PORT});
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
