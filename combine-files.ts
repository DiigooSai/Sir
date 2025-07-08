import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, relative } from 'path';

const outputFile = 'combined.txt'; // Name of the output file
const srcFolder = 'src'; // Source folder to scan
const excludedFolders = ['scripts', 'workers']; // Folders to exclude (at any level)

async function getFilesRecursive(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);

      // Check if the entry is a directory and if its name is in the excluded list
      if (entry.isDirectory()) {
        if (excludedFolders.includes(entry.name)) {
          return []; // Skip this folder and its contents
        }
        return getFilesRecursive(fullPath);
      }

      return fullPath;
    })
  );
  return files.flat();
}

async function combineFiles() {
  try {
    const allFiles = await getFilesRecursive(srcFolder);
    const fileContents = await Promise.all(
      allFiles.map(async (file) => {
        const content = await readFile(file, 'utf8');
        const relativePath = relative('.', file);
        return `\n${relativePath}\n${'-'.repeat(relativePath.length)}\n${content}`;
      })
    );
    const finalContent = fileContents.join('\n');
    await writeFile(outputFile, finalContent, 'utf8');
    console.log(`✅ Combined content written to ${outputFile}`);
  } catch (error) {
    console.error('❌ Error combining files:', error);
  }
}

combineFiles();
