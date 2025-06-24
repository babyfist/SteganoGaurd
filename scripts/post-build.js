
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'out');
const oldNextDir = path.join(outDir, '_next');
const newNextDir = path.join(outDir, 'next-assets');

// 1. Rename the _next directory to next-assets. This is often done to avoid
// issues with ad blockers that might target the default "_next" folder name.
if (fs.existsSync(oldNextDir)) {
  try {
    fs.renameSync(oldNextDir, newNextDir);
    console.log('Successfully renamed out/_next to out/next-assets');
  } catch (error) {
    console.error(`Error renaming directory: ${error}`);
    process.exit(1);
  }
} else {
    console.log('out/_next directory does not exist, skipping rename.');
}

// 2. Define options for replace-in-file to fix asset paths.
// We need to replace all absolute "/_next" paths with relative "./next-assets" paths.
const options = {
  files: [
    path.join(outDir, '**/*.html'),
    path.join(outDir, '**/*.css'),
    path.join(newNextDir, '**/*.js'),
  ],
  from: /\/_next/g,
  to: './next-assets', // Use "./" to ensure the path is always relative.
  allowEmptyPaths: true,
};

// 3. Run the replacement using a dynamic import for the ESM-only package.
(async function() {
    try {
        if (fs.existsSync(outDir)) {
            // Dynamically import the ESM package
            const { replaceInFileSync } = await import('replace-in-file');
            
            const results = replaceInFileSync(options);
            const changedFiles = results.filter(r => r.hasChanged).map(r => path.relative(outDir, r.file));
            if (changedFiles.length > 0) {
                console.log('Replaced asset paths in:', changedFiles);
            } else {
                console.log('No asset paths needed replacement.');
            }
        } else {
            console.log('`out` directory not found, skipping path replacement.');
        }
    } catch (error) {
        console.error('Error occurred during file replacement:', error);
        process.exit(1);
    }
    
    console.log('Post-build script completed successfully.');
})();
