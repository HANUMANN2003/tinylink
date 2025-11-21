import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

// ESM __dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// static serve
app.use(express.static(__dirname));

// DB init
let db;
(async () => {
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

  console.log("DB ready");
})();

// health
app.get("/healthz", (req, res) => res.json({ ok: true, version: "1.0" }));

// frontend pages
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/code/:code", (req, res) => res.sendFile(path.join(__dirname, "stats.html")));

// create
app.post("/api/links", async (req, res) => {
  const { url, code } = req.body;
  if (!url || !code) return res.status(400).json({ error: "Missing fields" });

  try {
    await db.run("INSERT INTO links (code, url) VALUES (?, ?)", code, url);
    return res.json({ ok: true });
  } catch (e) {
    console.error("Insert error", e);
    if (e && e.code && e.code.includes("SQLITE_CONSTRAINT")) return res.status(409).json({ error: "Code exists" });
    return res.status(500).json({ error: "Internal error" });
  }
});

// list all
app.get("/api/links", async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM links ORDER BY rowid DESC");
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal" });
  }
});

// get one
app.get("/api/links/:code", async (req, res) => {
  try {
    const row = await db.get("SELECT * FROM links WHERE code = ?", req.params.code);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal" });
  }
});

// delete
app.delete("/api/links/:code", async (req, res) => {
  try {
    await db.run("DELETE FROM links WHERE code = ?", req.params.code);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal" });
  }
});

// redirect (last)
app.get("/:code", async (req, res) => {
  try {
    const code = req.params.code;
    const row = await db.get("SELECT * FROM links WHERE code = ?", code);
    if (!row) return res.status(404).send("Not found");

    await db.run('UPDATE links SET clicks = clicks + 1, last_clicked = datetime("now") WHERE code = ?', code);

    let url = row.url;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    return res.redirect(302, url);
  } catch (e) {
    console.error(e);
    res.status(500).send("Server error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running on " + PORT));
