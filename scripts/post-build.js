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
    // DEBUG: Comprehensive event debugging for React Native Web
    (function() {
      if (typeof window !== 'undefined') {
        console.log('[DEBUG] Event debugging script loaded');
        
        // Track all click events at document level
        document.addEventListener('click', function(e) {
          console.log('[DEBUG] Click detected on document:', {
            target: e.target.tagName,
            className: e.target.className,
            id: e.target.id,
            role: e.target.getAttribute('role'),
            pointerEvents: getComputedStyle(e.target).pointerEvents,
            x: e.clientX,
            y: e.clientY
          });
        }, true); // Capture phase
        
        // Track touchstart events
        document.addEventListener('touchstart', function(e) {
          console.log('[DEBUG] Touchstart detected:', {
            target: e.target.tagName,
            className: e.target.className,
            touches: e.touches.length
          });
        }, true);
        
        // Check for elements blocking clicks
        function checkElementAtPoint(x, y) {
          const el = document.elementFromPoint(x, y);
          if (el) {
            const styles = getComputedStyle(el);
            console.log('[DEBUG] Element at point:', {
              tag: el.tagName,
              className: el.className,
              id: el.id,
              pointerEvents: styles.pointerEvents,
              zIndex: styles.zIndex,
              position: styles.position
            });
          }
          return el;
        }
        
        // Expose debug function globally
        window.debugClick = function(x, y) {
          x = x || window.innerWidth / 2;
          y = y || window.innerHeight / 2;
          checkElementAtPoint(x, y);
        };
        
        function initReactNativeWeb() {
          const root = document.getElementById('root');
          console.log('[DEBUG] initReactNativeWeb called, root exists:', !!root);
          
          if (root) {
            root.setAttribute('data-reactroot', '');
            root.style.pointerEvents = 'auto';
            root.style.touchAction = 'manipulation';
            root.style.userSelect = 'auto';
            root.style.webkitUserSelect = 'auto';
            
            // Log root children count
            console.log('[DEBUG] Root children count:', root.children.length);
            
            // Check for any pointer-events: none in the tree
            const allElements = root.querySelectorAll('*');
            let blockedCount = 0;
            allElements.forEach(el => {
              const pe = getComputedStyle(el).pointerEvents;
              if (pe === 'none') {
                blockedCount++;
                // Fix it
                el.style.pointerEvents = 'auto';
              }
            });
            console.log('[DEBUG] Fixed elements with pointer-events:none:', blockedCount);
            
            // Ensure body allows events
            if (document.body) {
              document.body.style.pointerEvents = 'auto';
              document.body.style.touchAction = 'manipulation';
            }
            
            console.log('[DEBUG] React Native Web event system initialized');
          }
        }
        
        // Initialize immediately
        initReactNativeWeb();
        
        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', function() {
            console.log('[DEBUG] DOMContentLoaded fired');
            initReactNativeWeb();
          });
        }
        
        // Initialize multiple times to catch React mounting
        [50, 100, 200, 500, 1000, 2000, 3000, 5000].forEach(delay => {
          setTimeout(function() {
            console.log('[DEBUG] Delayed init at ' + delay + 'ms');
            initReactNativeWeb();
          }, delay);
        });
        
        // Watch for React mounting
        let mutationCount = 0;
        const observer = new MutationObserver(function(mutations) {
          mutationCount++;
          if (mutationCount <= 10) {
            console.log('[DEBUG] Mutation #' + mutationCount + ':', mutations.length + ' changes');
            initReactNativeWeb();
          }
        });
        
        if (document.body) {
          observer.observe(document.body, {
            childList: true,
            subtree: true
          });
        }
        
        // Log when window loads
        window.addEventListener('load', function() {
          console.log('[DEBUG] Window load event fired');
          console.log('[DEBUG] Final root children:', document.getElementById('root')?.children.length);
          initReactNativeWeb();
        });
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
