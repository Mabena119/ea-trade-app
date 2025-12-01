const fs = require('fs');
const path = require('path');

// Paths
const distPath = path.join(__dirname, '..', 'dist');
const assetsPath = path.join(__dirname, '..', 'assets', 'images');

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
  
  // Ensure viewport meta tag is present and correct (critical for responsive design)
  const viewportRegex = /<meta\s+name=["']viewport["'][^>]*>/i;
  const correctViewport = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">';
  
  if (viewportRegex.test(html)) {
    // Replace existing viewport tag with correct one
    html = html.replace(viewportRegex, correctViewport);
  } else {
    // Add viewport tag right after <head>
    html = html.replace('<head>', `<head>\n  ${correctViewport}`);
  }
  
  // Add manifest link if not present
  if (!html.includes('manifest.json')) {
    html = html.replace('<head>', `<head>\n  <link rel="manifest" href="/manifest.json">`);
  }
  
  // Add Apple meta tags if not present
  if (!html.includes('apple-mobile-web-app-capable')) {
    const appleMetaTags = `
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
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/images/icon.png">`;
    html = html.replace('</head>', `${appleMetaTags}\n</head>`);
  }
  
  // Add theme color and other meta tags if not present
  if (!html.includes('theme-color')) {
    const themeMetaTags = `
  <meta name="msapplication-TileColor" content="#000000">
  <meta name="msapplication-TileImage" content="/assets/images/icon.png">
  <meta name="theme-color" content="#000000">`;
    html = html.replace('</head>', `${themeMetaTags}\n</head>`);
  }
  
  // Add responsive CSS if not present - minimal to avoid breaking React Native Web events
  if (!html.includes('safe-area-inset-top')) {
    const responsiveStyle = `
  <style>
    html, body {
      overflow-x: hidden;
      max-width: 100vw;
    }
    /* Only override overflow-y, don't touch pointer-events (breaks React Native Web) */
    body {
      overflow-y: auto !important;
    }
    #root, [data-reactroot] {
      max-width: 100vw;
      overflow-x: hidden;
    }
    /* Prevent horizontal scroll on mobile */
    @media screen and (max-width: 768px) {
      body {
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
      }
      #root, [data-reactroot] {
        width: 100vw;
        max-width: 100vw;
      }
    }
  </style>`;
    html = html.replace('</head>', `${responsiveStyle}\n</head>`);
  }
  
  fs.writeFileSync(indexPath, html);
  console.log('Updated index.html with responsive viewport and PWA meta tags');
}

console.log('PWA setup completed successfully!');
