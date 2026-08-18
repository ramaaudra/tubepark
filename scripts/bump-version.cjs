#!/usr/bin/env node

const fs = require('fs');
const args = process.argv.slice(2);
const type = args[0] || 'patch';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);

let newVersion;
switch(type) {
  case 'major': newVersion = `${major + 1}.0.0`; break;
  case 'minor': newVersion = `${major}.${minor + 1}.0`; break;
  default: newVersion = `${major}.${minor}.${patch + 1}`;
}

pkg.version = newVersion;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

let config = fs.readFileSync('wxt.config.ts', 'utf8');
config = config.replace(/version: "[^"]+"/, `version: "${newVersion}"`);
fs.writeFileSync('wxt.config.ts', config);

console.log(`Version bumped to ${newVersion}`);
