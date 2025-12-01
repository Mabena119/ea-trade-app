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
  
  // CRITICAL: Override expo-reset overflow:hidden which blocks ALL interactions
  // Replace the entire expo-reset style block to fix overflow
  html = html.replace(
    /<style id="expo-reset">([\s\S]*?)<\/style>/,
    (match, content) => {
      // Replace body overflow:hidden with overflow-y:auto
      const fixedContent = content.replace(
        /body\s*\{[^}]*overflow:\s*hidden[^}]*\}/,
        'body { overflow-y: auto !important; overflow-x: hidden !important; }'
      );
      return `<style id="expo-reset">${fixedContent}</style>`;
    }
  );
  
  // Add responsive CSS and ensure React Native Web events work
  if (!html.includes('safe-area-inset-top')) {
    const responsiveStyle = `
  <style>
    html, body {
      overflow-x: hidden;
      max-width: 100vw;
    }
    /* Ensure body allows interactions - CRITICAL for React Native Web */
    body {
      overflow-y: auto !important;
      overflow-x: hidden !important;
      /* Ensure events can propagate */
      touch-action: manipulation;
    }
    #root, [data-reactroot] {
      max-width: 100vw;
      overflow-x: hidden;
      /* Ensure root doesn't block events */
      touch-action: manipulation;
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
  </style>
  <script>
    // CRITICAL: Initialize React Native Web event handling BEFORE React loads
    (function() {
      if (typeof window !== 'undefined') {
        // Set up event handling immediately
        function initEventHandling() {
          try {
            // Ensure body allows all interactions
            if (document.body) {
              document.body.style.touchAction = 'manipulation';
              document.body.style.pointerEvents = 'auto';
              document.body.style.userSelect = 'auto';
            }
            
            // Ensure root element allows events
            const root = document.getElementById('root');
            if (root) {
              root.style.touchAction = 'manipulation';
              root.style.pointerEvents = 'auto';
              root.style.userSelect = 'auto';
            }
            
            // Remove any overlays that might block clicks
            const overlays = document.querySelectorAll('[style*="pointer-events: none"]');
            overlays.forEach(el => {
              if (el !== document.body && el !== root) {
                el.style.pointerEvents = 'auto';
              }
            });
            
            console.log('React Native Web event handling initialized');
          } catch (e) {
            console.error('Event handling init error:', e);
          }
        }
        
        // Initialize immediately
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initEventHandling);
        } else {
          initEventHandling();
        }
        
        // Initialize multiple times to catch React mounting
        setTimeout(initEventHandling, 50);
        setTimeout(initEventHandling, 100);
        setTimeout(initEventHandling, 300);
        setTimeout(initEventHandling, 500);
        setTimeout(initEventHandling, 1000);
        setTimeout(initEventHandling, 2000);
        
        // Watch for React mounting
        const observer = new MutationObserver(function(mutations) {
          initEventHandling();
        });
        
        if (document.body) {
          observer.observe(document.body, {
            childList: true,
            subtree: true
          });
        }
      }
    })();
  </script>`;
    html = html.replace('</head>', `${responsiveStyle}\n</head>`);
  }
  
  // CRITICAL: Remove defer from script tag to ensure React Native Web events work
  // defer can cause timing issues with React Native Web's event system
  html = html.replace(
    /<script src="([^"]+)" defer><\/script>/g,
    '<script src="$1"></script>'
  );
  
  fs.writeFileSync(indexPath, html);
  console.log('Updated index.html with responsive viewport and PWA meta tags');
}

console.log('PWA setup completed successfully!');
