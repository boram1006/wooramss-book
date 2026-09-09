const fs = require('node:fs');
const path = require('node:path');
const Babel = require('@babel/standalone');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src', 'app.jsx');
const outputPath = path.join(root, 'app.js');
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
fs.writeFileSync(outputPath, `${result.code}\n`, 'utf8');
console.log(`Built app.js (${Buffer.byteLength(result.code)} bytes)`);
