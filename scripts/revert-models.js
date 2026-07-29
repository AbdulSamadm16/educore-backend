const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, '../src/models');
const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(modelsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace require
  content = content.replace(/const createModelProxy = require\(['"]\.\.\/utils\/modelProxy['"]\);\n?/g, '');
  content = content.replace(/const createModelProxy = require\(['"]\.\/utils\/modelProxy['"]\);\n?/g, '');

  // Replace module.exports = createModelProxy('ModelName', schema);
  // We need to match createModelProxy( 'Name', schemaName )
  const regex = /module\.exports = createModelProxy\(\s*['"](.*?)['"]\s*,\s*(.*?)\s*\);/g;
  content = content.replace(regex, "module.exports = mongoose.model('$1', $2);");

  fs.writeFileSync(filePath, content, 'utf8');
});

console.log('Models reverted successfully.');
