import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import sqlite3 from "sqlite3";
import { open } from "sqlite";

// Convert import.meta.url → __dirname (because ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve index.html, stats.html, etc.

// ======================
// DATABASE INIT
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

// ======================
// API: CREATE LINK
// ======================
app.post("/api/links", async (req, res) => {
  try {
    const { url, code } = req.body;

    if (!url || !code) {
      return res.status(400).json({ error: "Missing fields" });
    }

    await db.run("INSERT INTO links (code, url) VALUES (?, ?)", code, url);

    res.json({ ok: true });
  } catch (error) {
    console.error("INSERT ERROR:", error);

    if (error.code && error.code.includes("SQLITE_CONSTRAINT")) {
      return res.status(409).json({ error: "Code exists" });
    }

    res.status(500).json({ error: "Internal server error" });
  }
});

// ======================
// API: LIST ALL LINKS
// ======================
app.get("/api/links", async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM links ORDER BY rowid DESC");
    res.json(rows);
  } catch (error) {
    console.error("LIST ERROR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ======================
// API: GET SINGLE LINK
// ======================
app.get("/api/links/:code", async (req, res) => {
  try {
    const row = await db.get(
      "SELECT * FROM links WHERE code = ?",
      req.params.code
    );

    if (!row) return res.status(404).json({ error: "Not found" });

    res.json(row);
  } catch (error) {
    console.error("FETCH ERROR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ======================
// API: DELETE LINK
// ======================
app.delete("/api/links/:code", async (req, res) => {
  try {
    await db.run("DELETE FROM links WHERE code = ?", req.params.code);
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE ERROR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ======================
// REDIRECT HANDLER (IMPORTANT: LAST ROUTE)
// ======================
app.get("/:code", async (req, res) => {
  try {
    const code = req.params.code;

    const row = await db.get("SELECT * FROM links WHERE code = ?", code);

    if (!row) return res.status(404).send("Not found");

    await db.run(
      `UPDATE links 
       SET clicks = clicks + 1, last_clicked = datetime('now')
       WHERE code = ?`,
      code
    );

    let target = row.url;
    if (!/^https?:\/\//i.test(target)) target = "https://" + target;

    res.redirect(302, target);
  } catch (error) {
    console.error("REDIRECT ERROR:", error);
    res.status(500).send("Server error");
  }
});

// ======================
// START SERVER
// ======================
async function start() {
  await initDb();

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log("TinyLink server running on port " + PORT);
  });
}

start();
