import './instrumentation.js';
import express from 'express';
import sqlite3 from 'sqlite3';
import os from 'os';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 80;

app.use(express.json());

// Ensure the database directory exists
const dbDir = '/data';
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at', dbPath);
    // Initialize the users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL
      )
    `);
  }
});

// Helper to generate a URL-friendly slug
function generateSlug(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-');        // Replace multiple - with single -
}

// Endpoint to retrieve backend container info
app.get('/api/users/info', (req, res) => {
  res.json({
    container_id: os.hostname(),
    message: "Backend API is up and running!"
  });
});

// Endpoint to get all users
app.get('/api/users', (req, res) => {
  db.all('SELECT name, slug FROM users', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Endpoint to create a user (POST /api/users)
app.post('/api/users', (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Name is required' });
  }

  const slug = generateSlug(name) + '-' + Math.floor(Math.random() * 1000); // add random suffix to prevent conflicts

  db.run('INSERT INTO users (name, slug) VALUES (?, ?)', [name, slug], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({ id: this.lastID, name, slug });
  });
});

// Endpoint to delete a user (DELETE /api/users/:slug)
app.delete('/api/users/:slug', (req, res) => {
  const { slug } = req.params;

  db.run('DELETE FROM users WHERE slug = ?', [slug], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully', slug });
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
