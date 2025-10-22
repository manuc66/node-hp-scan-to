import { execSync } from "child_process";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from "fs";

import path from "path";

try {
  const commitId = execSync('git rev-parse HEAD').toString().trim();
  const commitInfo = { commitId };
  const __dirname = getDirname(import.meta.url);
  fs.writeFileSync(
    path.join(__dirname, './src/commitInfo.json'),
    JSON.stringify(commitInfo, null, 2)
  );

  console.log('Commit ID saved to src/commitInfo.json');
} catch (error) {
  console.error('Error getting commit ID:', error);
  process.exit(1);
}

function getDirname(importMetaUrl) {
  return dirname(fileURLToPath(importMetaUrl));
}