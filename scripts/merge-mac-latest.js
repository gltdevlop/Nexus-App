const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const distDir = path.join(__dirname, '../dist');
const x64Dir = path.join(distDir, 'x64');
const arm64Dir = path.join(distDir, 'arm64');
const outputFile = path.join(distDir, 'latest-mac.yml');

function readYaml(filePath) {
    if (!fs.existsSync(filePath)) {
        console.warn(`Warning: File not found: ${filePath}`);
        return null;
    }
    return yaml.load(fs.readFileSync(filePath, 'utf8'));
}

const x64Manifest = readYaml(path.join(x64Dir, 'latest-mac.yml'));
const arm64Manifest = readYaml(path.join(arm64Dir, 'latest-mac.yml'));

if (!x64Manifest && !arm64Manifest) {
    console.error('Error: No latest-mac.yml found in x64 or arm64 directories.');
    process.exit(1);
}

// Use x64 as base, or arm64 if x64 is missing
const mergedManifest = x64Manifest ? { ...x64Manifest } : { ...arm64Manifest };
mergedManifest.files = [];

if (x64Manifest && x64Manifest.files) {
    mergedManifest.files.push(...x64Manifest.files);
}

if (arm64Manifest && arm64Manifest.files) {
    mergedManifest.files.push(...arm64Manifest.files);
}

// Ensure unique files by url
const uniqueFiles = [];
const seenUrls = new Set();

for (const file of mergedManifest.files) {
    if (!seenUrls.has(file.url)) {
        seenUrls.add(file.url);
        uniqueFiles.push(file);
    }
}

mergedManifest.files = uniqueFiles;

fs.writeFileSync(outputFile, yaml.dump(mergedManifest));
console.log(`Merged latest-mac.yml written to ${outputFile}`);
