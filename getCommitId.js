import { execSync } from "child_process";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from "fs";

import path from "path";

try {
  const __dirname = getDirname(import.meta.url);
  const commitInfoPath = path.join(__dirname, './src/commitInfo.json');
  
  // Check if commitInfo.json already exists with a valid commit ID
  let existingCommitId = null;
  if (fs.existsSync(commitInfoPath)) {
    try {
      const existingData = JSON.parse(fs.readFileSync(commitInfoPath, 'utf-8'));
      if (existingData.commitId && existingData.commitId !== 'unknown') {
        existingCommitId = existingData.commitId;
      }
    } catch (parseError) {
      // Ignore parse errors, will regenerate the file
    }
  }
  
  let commitId;
  try {
    commitId = execSync('git rev-parse HEAD', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    console.log('Commit ID retrieved from git:', commitId);
  } catch (gitError) {
    // Git not available
    if (existingCommitId) {
      // Keep the existing valid commit ID
      console.log('Git not available, keeping existing commit ID:', existingCommitId);
      commitId = existingCommitId;
    } else {
      // No existing valid commit ID, use fallback
      console.warn('Git not available and no existing commit ID, using fallback');
      commitId = 'unknown';
    }
  }
  
  const commitInfo = { commitId };
  fs.writeFileSync(
    commitInfoPath,
    JSON.stringify(commitInfo, null, 2)
  );

  console.log('Commit ID saved to src/commitInfo.json');
} catch (error) {
  console.error('Error saving commit ID:', error);
  process.exit(1);
}

function getDirname(importMetaUrl) {
  return dirname(fileURLToPath(importMetaUrl));
}