
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Utility to find all files with a specific extension recursively
function findFilesByExt(startPath, filter) {
    let results = [];
    if (!fs.existsSync(startPath)) {
        console.log("Directory not found: ", startPath);
        return [];
    }
    const files = fs.readdirSync(startPath);
    for (let i = 0; i < files.length; i++) {
        const filename = path.join(startPath, files[i]);
        const stat = fs.lstatSync(filename);
        if (stat.isDirectory()) {
            results = results.concat(findFilesByExt(filename, filter));
        } else if (filename.endsWith(filter)) {
            results.push(filename);
        }
    }
    return results;
}

async function main() {
    console.log("Starting post-build script for web extension...");

    const outDir = path.join(__dirname, '..', 'out');
    const oldNextDir = path.join(outDir, '_next');
    const newNextDir = path.join(outDir, 'next-assets');
    
    // Use oldNextDir to find chunks directory before it's renamed
    const chunksDir = path.join(oldNextDir, 'static', 'chunks');

    // Extract inline scripts from HTML files to comply with Manifest V3 CSP
    const htmlFiles = findFilesByExt(outDir, '.html');
    for (const htmlFile of htmlFiles) {
        let content = fs.readFileSync(htmlFile, 'utf8');
        const inlineScriptRegex = /<script>(.*?)<\/script>/gs;
        let modified = false;

        // Ensure the directory for extracted scripts exists
        if (fs.existsSync(oldNextDir) && !fs.existsSync(chunksDir)) {
            fs.mkdirSync(chunksDir, { recursive: true });
        }
        
        // Use a function to replace content to handle multiple scripts correctly
        const replacer = (scriptTag, scriptContent) => {
            if (scriptContent && scriptContent.trim()) {
                modified = true;
                const hash = crypto.createHash('sha256').update(scriptContent).digest('hex').substring(0, 16);
                const scriptFilename = `inline-${hash}.js`;
                const scriptPath = path.join(chunksDir, scriptFilename);
                
                fs.writeFileSync(scriptPath, scriptContent.trim(), 'utf8');
                console.log(`Extracted inline script to ${path.relative(outDir, scriptPath)}`);

                // The path here uses _next, which we will replace later
                return `<script src="/_next/static/chunks/${scriptFilename}"></script>`;
            }
            // Return original tag if script is empty
            return scriptTag;
        }

        const newContent = content.replace(inlineScriptRegex, replacer);
        
        if (modified) {
            fs.writeFileSync(htmlFile, newContent, 'utf8');
            console.log(`Updated script tags in ${path.basename(htmlFile)}`);
        }
    }

    // Rename the directory
    if (fs.existsSync(oldNextDir)) {
        fs.renameSync(oldNextDir, newNextDir);
        console.log('Renamed `_next` directory to `next-assets`');
    }

    // Fix all asset paths to be relative and use the new directory name
    try {
        const { replaceInFileSync } = await import('replace-in-file');
        
        const filesToPatch = [
            path.join(outDir, '**/*.html'),
            path.join(outDir, '**/*.css'),
            path.join(newNextDir, '**/*.js'), // Search in the NEW directory
        ];
        
        // This regex finds all occurrences of `/_next/` and replaces them.
        const results = replaceInFileSync({
            files: filesToPatch,
            from: /\/_next\//g,
            to: './next-assets/',
            allowEmptyPaths: true,
        });

        const changedFiles = results
            .filter(r => r.hasChanged)
            .map(r => path.relative(outDir, r.file));

        if (changedFiles.length > 0) {
            console.log('Fixed asset paths in:', [...new Set(changedFiles)]);
        } else {
            console.log('No asset paths needed fixing.');
        }

    } catch (error) {
        console.error('Error occurred during file path replacement:', error);
        process.exit(1);
    }

    console.log('Post-build script finished successfully.');
}

main();
