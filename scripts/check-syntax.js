const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.js')) {
      results.push(file);
    }
  });
  return results;
}

const srcDir = path.join(__dirname, '../src');
if (!fs.existsSync(srcDir)) {
  console.log('src directory not found');
  process.exit(0);
}

const files = walk(srcDir);
let hasErrors = false;

files.forEach((file) => {
  try {
    execSync(`node -c "${file}"`, { stdio: 'ignore' });
  } catch (err) {
    console.error(`Syntax error in file: ${file}`);
    console.error(err.message);
    hasErrors = true;
  }
});

if (hasErrors) {
  process.exit(1);
} else {
  console.log('All JS files in src/ have valid syntax.');
  process.exit(0);
}
