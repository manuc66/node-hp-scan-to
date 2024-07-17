const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  const commitId = execSync('git rev-parse HEAD').toString().trim();
  const commitInfo = { commitId };

  fs.writeFileSync(
    path.join(__dirname, './src/commitInfo.json'),
    JSON.stringify(commitInfo, null, 2)
  );

  console.log('Commit ID saved to src/commitInfo.json');
} catch (error) {
  console.error('Error getting commit ID:', error);
  process.exit(1);
}