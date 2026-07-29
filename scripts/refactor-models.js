const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, '../src/models');
const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(modelsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Check if already refactored
  if (content.includes('createModelProxy')) {
    console.log(`Skipping ${file} - already refactored`);
    return;
  }

  // 1. Add import
  content = `const createModelProxy = require('../utils/modelProxy');\n` + content;

  // 2. Replace export
  // Pattern: module.exports = mongoose.model('ModelName', schemaName);
  const regex = /module\.exports\s*=\s*mongoose\.model\(\s*['"]([^'"]+)['"]\s*,\s*([^)]+)\s*\);/g;
  
  const originalContent = content;
  content = content.replace(regex, (match, modelName, schemaName) => {
    return `module.exports = createModelProxy('${modelName}', ${schemaName});`;
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Refactored ${file}`);
  } else {
    console.log(`Warning: Could not find mongoose.model export in ${file}`);
  }
});
