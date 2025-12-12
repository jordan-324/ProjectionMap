#!/usr/bin/env node
/**
 * Simple HTTP server for local development.
 * Browsers require HTTPS or localhost for webcam access.
 * 
 * Usage:
 *     node server.js
 * 
 * Or if you have http-server installed:
 *     npx http-server -p 8000
 * 
 * Then open: http://localhost:8000/base/
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8000;
const BASE_DIR = path.join(__dirname, 'base');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Remove query string and normalize path
  let urlPath = req.url.split('?')[0];
  
  // Serve from base directory
  let filePath = path.join(BASE_DIR, urlPath === '/' ? 'index.html' : urlPath);
  
  // Default to index.html if directory
  if (filePath.endsWith('/') || (!path.extname(filePath) && fs.existsSync(filePath) && fs.statSync(filePath).isDirectory())) {
    filePath = path.join(filePath, 'index.html');
  }
  
  // Security: prevent directory traversal
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(BASE_DIR);
  if (!resolvedPath.startsWith(resolvedBase)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
      return;
    }
    
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open: http://localhost:${PORT}/`);
  if (process.env.PORT) {
    console.log('Deployed on Render - HTTPS enabled for webcam access');
  }
});

