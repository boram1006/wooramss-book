const fs = require('node:fs');
const path = require('node:path');
const Babel = require('@babel/standalone');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src', 'app.jsx');
const outputPath = path.join(root, 'app.js');
const publicDir = path.join(root, 'public');
const publicOutputPath = path.join(publicDir, 'app.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const result = Babel.transform(source, {
  filename: sourcePath,
  presets: [['react', { runtime: 'classic' }]],
  comments: false,
  compact: true,
  minified: true,
  sourceMaps: false
});

if (!result?.code) throw new Error('Client compilation returned no output.');
const output = `${result.code}\n`;
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(outputPath, output, 'utf8');
fs.writeFileSync(publicOutputPath, output, 'utf8');
fs.copyFileSync(path.join(root, 'index.html'), path.join(publicDir, 'index.html'));
fs.cpSync(path.join(root, 'assets'), path.join(publicDir, 'assets'), { recursive: true });
console.log(`Built app.js (${Buffer.byteLength(result.code)} bytes)`);
