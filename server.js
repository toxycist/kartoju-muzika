const express = require('express');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
const baseDir = path.join(__dirname, 'music_files');
const themesDir = path.join(__dirname, 'themes');

ffmpeg.setFfmpegPath('/usr/sbin/ffmpeg');

// --- theme resolution -----------------------------------------------------
// A "theme" is now just a folder under /themes containing a styles.css.
// index.html is shared and never changes; only which stylesheet gets
// served at /styles.css changes.

function listThemes() {
  if (!fs.existsSync(themesDir)) return [];
  return fs.readdirSync(themesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => fs.existsSync(path.join(themesDir, name, 'styles.css')))
    .sort();
}

function getCookieTheme(req) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)theme=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function resolveTheme(req) {
  const themes = listThemes();
  if (themes.length === 0) return null;

  const requested = getCookieTheme(req);
  if (requested && themes.includes(requested)) return requested;

  return themes.includes('dark') ? 'dark' : themes[0];
}

app.get('/api/themes', (req, res) => {
  res.json(listThemes());
});

app.get('/api/theme/:name', (req, res) => {
  const themes = listThemes();
  if (!themes.includes(req.params.name)) {
    return res.status(400).json({ error: 'unknown theme' });
  }

  res.setHeader(
    'Set-Cookie',
    `theme=${encodeURIComponent(req.params.name)}; Path=/; Max-Age=31536000; SameSite=Lax`
  );
  res.redirect('/');
});

app.get('/styles.css', (req, res) => {
  const theme = resolveTheme(req);
  if (!theme) {
    return res.status(404).send('not found');
  }
  res.sendFile(path.join(themesDir, theme, 'styles.css'));
});

app.get('/naujienos.html', (req, res) => {
  res.sendFile(path.join(__dirname, "naujienos.html"));
});

// --- everything else (index.html, app.js, theme-switcher.js, music files) is static ---
app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp3')) {
      res.set('Content-Type', 'audio/mpeg');
    }
  }
}));

app.get('/api/files/:grade/:semester/:category', (req, res) => {
  const { grade, semester, category } = req.params;
  const folderPath = path.join(baseDir, `grade_${grade}`, `semester_${semester}`, category);

  if (!fs.existsSync(folderPath)) {
    return res.status(404).json({ error: 'folder not found' });
  }

  function findMp3s(dir) {
    const items = fs.readdirSync(dir);
    let files = [];
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        files = files.concat(findMp3s(fullPath));
      } else if (item.toLowerCase().endsWith('.mp3')) {
        const idMatch = item.match(/^(\d+)/);
        const trackId = idMatch ? idMatch[1] : null;
        files.push({
          filename: item,
          filepath: fullPath,
          trackId: trackId,
          relpath: path.relative(folderPath, fullPath)
        });
      }
    });
    return files;
  }

  const files = findMp3s(folderPath);
  res.json(files);
});

app.get('/api/clip/:grade/:semester/:category/:filename', (req, res) => {
  const { grade, semester, category, filename } = req.params;
  const duration = parseInt(req.query.duration) || 30;
  const forceStart = req.query.forceStart === 'true';
  const folderPath = path.join(baseDir, `grade_${grade}`, `semester_${semester}`, category);
  const filePath = path.join(folderPath, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'file not found' });
  }

  ffmpeg(filePath)
    .ffprobe((err, data) => {
      if (err) {
        return res.status(500).json({ error: 'could not read file' });
      }

      const totalDuration = data.format.duration;
      const clipDuration = Math.min(duration, totalDuration);
      let startTime = 0;

      if (!forceStart && totalDuration > clipDuration) {
        startTime = Math.random() * (totalDuration - clipDuration);
      }

      const tmpFile = path.join('/tmp', `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`);

      ffmpeg(filePath)
        .setStartTime(startTime)
        .duration(clipDuration)
        .output(tmpFile)
        .on('end', () => {
          res.download(tmpFile, (err) => {
            fs.unlink(tmpFile, () => {});
          });
        })
        .on('error', (err) => {
          res.status(500).json({ error: 'clip generation failed' });
        })
        .run();
    });
});

app.get('/api/categories/:grade/:semester', (req, res) => {
  const { grade, semester } = req.params;
  const folderPath = path.join(baseDir, `grade_${grade}`, `semester_${semester}`);

  if (!fs.existsSync(folderPath)) {
    return res.status(404).json({ error: 'folder not found' });
  }

  const items = fs.readdirSync(folderPath);
  const categories = items
    .filter(item => fs.statSync(path.join(folderPath, item)).isDirectory())
    .sort();

  res.json(categories);
});

app.get('/api/tree/:grade/:semester/:category?', (req, res) => {
  const { grade, semester, category } = req.params;
  let folderPath = path.join(baseDir, `grade_${grade}`, `semester_${semester}`);

  if (category) {
    folderPath = path.join(folderPath, category);
  }

  if (!fs.existsSync(folderPath)) {
    return res.status(404).json({ error: 'folder not found' });
  }

  function buildTree(dir) {
    const items = fs.readdirSync(dir);
    return items.map(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      return {
        name: item,
        type: stat.isDirectory() ? 'folder' : 'file',
        children: stat.isDirectory() ? buildTree(fullPath) : undefined
      };
    }).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  res.json(buildTree(folderPath));
});

app.listen(1717, () => console.log('server running on http://localhost:1717'));