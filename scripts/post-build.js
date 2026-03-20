const fs = require('fs');
const path = require('path');

// Paths
const distPath = path.join(__dirname, '..', 'dist');
const assetsPath = path.join(__dirname, '..', 'assets', 'images');
const publicPath = path.join(__dirname, '..', 'public');

// Create manifest.json
const manifest = {
  "name": "EA Trade",
  "short_name": "EA Trade",
  "description": "Automated Forex Trading EA Trade App",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#000000",
  "background_color": "#000000",
  "scope": "/",
  "lang": "en",
  "categories": ["finance", "business", "productivity"],
  "icons": [
    {
      "src": "./assets/images/icon.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "./assets/images/adaptive-icon.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "screenshots": [
    {
      "src": "./assets/images/icon.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide"
    }
  ],
  "related_applications": []
};

// Write manifest.json
fs.writeFileSync(
  path.join(distPath, 'manifest.json'),
  JSON.stringify(manifest, null, 2)
);

// Copy icons to dist folder
const iconFiles = ['icon.png', 'adaptive-icon.png', 'favicon.png'];

iconFiles.forEach(file => {
  const srcPath = path.join(assetsPath, file);
  const destPath = path.join(distPath, 'assets', 'images', file);
  
  // Create assets/images directory if it doesn't exist
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${file} to dist/assets/images/`);
  }
});

// Update index.html to include manifest and Apple meta tags
const indexPath = path.join(distPath, 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');
  
  // Add manifest link
  if (!html.includes('manifest.json')) {
    html = html.replace(
      '<head>',
      `<head>
  <link rel="manifest" href="/manifest.json">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black">
  <meta name="apple-mobile-web-app-title" content="EA Trade">
  <link rel="apple-touch-icon" href="/assets/images/icon.png">
  <link rel="apple-touch-icon" sizes="57x57" href="/assets/images/icon.png">
  <link rel="apple-touch-icon" sizes="60x60" href="/assets/images/icon.png">
  <link rel="apple-touch-icon" sizes="72x72" href="/assets/images/icon.png">
  <link rel="apple-touch-icon" sizes="76x76" href="/assets/images/icon.png">
  <link rel="apple-touch-icon" sizes="114x114" href="/assets/images/icon.png">
  <link rel="apple-touch-icon" sizes="120x120" href="/assets/images/icon.png">
  <link rel="apple-touch-icon" sizes="144x144" href="/assets/images/icon.png">
  <link rel="apple-touch-icon" sizes="152x152" href="/assets/images/icon.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/images/icon.png">
  <meta name="msapplication-TileColor" content="#000000">
  <meta name="msapplication-TileImage" content="/assets/images/icon.png">
  <meta name="theme-color" content="#000000">
  <meta name="apple-mobile-web-app-status-bar-style" content="black">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no">
  <style>
    body {
      background-color: #000000 !important;
    }
    /* iOS safe area: notch, home indicator, rounded corners */
    @supports (padding: env(safe-area-inset-top)) {
      body {
        padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
        min-height: 100vh;
        min-height: -webkit-fill-available;
      }
    }
  </style>`
    );
  }
  
  // Remove duplicate viewport so our PWA viewport (with viewport-fit=cover) wins on iOS
  html = html.replace(
    /<meta\s+name="viewport"\s+content="[^"]*"\s*\/?>/g,
    (match) => match.includes('viewport-fit=cover') ? match : ''
  ).replace(/\n\s*\n\s*\n/g, '\n\n');

  fs.writeFileSync(indexPath, html);
  console.log('Updated index.html with PWA meta tags');
}

// Copy service worker for Web Push (iOS PWA background notifications)
const swSrc = path.join(publicPath, 'sw.js');
const swDest = path.join(distPath, 'sw.js');
if (fs.existsSync(swSrc)) {
  fs.copyFileSync(swSrc, swDest);
  console.log('Copied sw.js for Web Push');
}

console.log('PWA setup completed successfully!');
