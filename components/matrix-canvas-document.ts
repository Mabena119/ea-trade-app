/**
 * WebView document: classic canvas digital rain.
 * Faint green trail (frame-to-frame black overlay); bright head; dense columns.
 */
export const MATRIX_RAIN_CANVAS_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    * { margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    canvas { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    (function () {
      var GLYPHS = 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝﾊﾐﾊｸﾈﾊｲﾀﾁ012345789';
      var c = document.getElementById('c');
      var g = c.getContext('2d', { alpha: false });
      var w = 0, h = 0, dpr = 1;
      var n = 0, cw = 11;
      var drops = [];
      function pick() { return GLYPHS[Math.floor(Math.random() * GLYPHS.length)] || '0'; }

      function size() {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        w = window.innerWidth;
        h = window.innerHeight;
        c.width = Math.floor(w * dpr);
        c.height = Math.floor(h * dpr);
        c.style.width = w + 'px';
        c.style.height = h + 'px';
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        n = Math.max(18, Math.min(56, Math.floor(w / cw)));
        drops = new Array(n);
        for (var i = 0; i < n; i++) {
          drops[i] = { y: Math.random() * h, s: 1.1 + Math.random() * 2.5 + (i % 4) * 0.2 };
        }
        g.fillStyle = '#000';
        g.fillRect(0, 0, w, h);
      }

      function frame() {
        g.fillStyle = 'rgba(0, 0, 0, 0.05)';
        g.fillRect(0, 0, w, h);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = '600 12px ui-monospace, Menlo, Monaco, monospace';
        for (var i = 0; i < n; i++) {
          var x = i * cw + cw * 0.5;
          var y = drops[i].y;
          g.shadowColor = 'rgba(0, 255, 120, 0.55)';
          g.shadowBlur = (i % 7 === 0) ? 5 : 3;
          g.fillStyle = (i + Math.floor(y * 0.1)) % 9 === 0
            ? 'rgba(220, 255, 235, 0.95)'
            : 'rgba(0, 255, 90, 0.88)';
          g.fillText(pick(), x, y);
          g.shadowBlur = 0;
          drops[i].y += drops[i].s;
          if (drops[i].y > h) {
            drops[i].y = -30 - Math.random() * 120;
            drops[i].s = 1.0 + Math.random() * 2.8;
          }
        }
        requestAnimationFrame(frame);
      }

      window.addEventListener('resize', size);
      size();
      requestAnimationFrame(frame);
    })();
  </script>
</body>
</html>`;
