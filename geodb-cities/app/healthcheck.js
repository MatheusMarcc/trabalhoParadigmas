#!/usr/bin/env node

/**
 * Script de healthcheck para Docker
 * Verifica se o servidor está respondendo corretamente
 */

const http = require('http');

const options = {
  hostname: 'localhost',
  port: process.env.PORT || 3000,
  path: '/api/health',
  method: 'GET',
  timeout: 3000,
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    console.error(`Healthcheck failed: Status ${res.statusCode}`);
    process.exit(1);
  }
});

req.on('error', (err) => {
  console.error(`Healthcheck failed: ${err.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('Healthcheck timeout');
  req.destroy();
  process.exit(1);
});

req.end();
