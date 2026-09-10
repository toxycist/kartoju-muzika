const express = require('express');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
require('dotenv').config({quiet: true});

const app = express();
const baseDir = path.join(__dirname, 'music_files');
const themesDir = path.join(__dirname, 'themes');

// Name of the track-group listing file expected in every category folder.
// Change this if your actual filename differs.
const GROUPS_FILENAME = 'groups.txt';

ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);

// --- theme resolution -----------------------------------------------------

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

// --- track groups -----------------------------------------------------
// Each category folder now holds a flat list of .mp3 files plus one
// GROUPS_FILENAME file that maps track-id ranges to a group name, e.g.:
//   01-10 operas,
//   11-15 rock,
//   16-23 metal
// Ranges are comma- and/or newline-separated. A single id with no dash
// (e.g. "24 solo") is also accepted as a one-track group.

function parseGroups(folderPath) {
  const groupsFilePath = path.join(folderPath, GROUPS_FILENAME);
  if (!fs.existsSync(groupsFilePath)) return [];

  const raw = fs.readFileSync(groupsFilePath, 'utf8');
  const entries = raw.split(/[,\n]/).map(s => s.trim()).filter(Boolean);

  const groups = [];
  entries.forEach(entry => {
    const match = entry.match(/^(\d+)(?:-(\d+))?\s+(.+)$/);
    if (!match) {
      console.warn(`skipping unrecognized line in ${groupsFilePath}: "${entry}"`);
      return;
    }
    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : start;
    groups.push({ start, end, name: match[3].trim() });
  });

  groups.sort((a, b) => a.start - b.start);
  return groups;
}

// Builds the tree shape the frontend already expects ({name, type, children}),
// but the "folders" are virtual groups derived from groups.txt rather than
// real directories - files themselves are always flat inside folderPath.
function buildGroupedTree(folderPath) {
  const groups = parseGroups(folderPath);

  const fileNodes = fs.readdirSync(folderPath)
    .filter(item => {
      if (item === GROUPS_FILENAME) return false;
      const fullPath = path.join(folderPath, item);
      return fs.statSync(fullPath).isFile() && item.toLowerCase().endsWith('.mp3');
    })
    .map(item => {
      const idMatch = item.match(/^(\d+)/);
      return { name: item, trackId: idMatch ? parseInt(idMatch[1], 10) : null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const groupedNames = new Set();

  const groupNodes = groups.map(group => {
    const children = fileNodes
      .filter(f => f.trackId !== null && f.trackId >= group.start && f.trackId <= group.end)
      .map(f => {
        groupedNames.add(f.name);
        return { name: f.name, type: 'file' };
      });
    return { name: group.name, type: 'folder', children };
  }).filter(group => group.children.length > 0);

  const ungroupedNodes = fileNodes
    .filter(f => !groupedNames.has(f.name))
    .map(f => ({ name: f.name, type: 'file' }));

  return [...groupNodes, ...ungroupedNodes];
}

app.get('/api/files/:grade/:semester/:category', (req, res) => {
  const { grade, semester, category } = req.params;
  const folderPath = path.join(baseDir, `grade_${grade}`, `semester_${semester}`, category);

  if (!fs.existsSync(folderPath)) {
    return res.status(404).json({ error: 'folder not found' });
  }

  const files = fs.readdirSync(folderPath)
    .filter(item => {
      if (item === GROUPS_FILENAME) return false;
      const fullPath = path.join(folderPath, item);
      return fs.statSync(fullPath).isFile() && item.toLowerCase().endsWith('.mp3');
    })
    .map(item => {
      const idMatch = item.match(/^(\d+)/);
      return {
        filename: item,
        filepath: path.join(folderPath, item),
        trackId: idMatch ? idMatch[1] : null,
        relpath: item
      };
    });

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
  const semesterPath = path.join(baseDir, `grade_${grade}`, `semester_${semester}`);

  if (category) {
    const categoryPath = path.join(semesterPath, category);
    if (!fs.existsSync(categoryPath)) {
      return res.status(404).json({ error: 'folder not found' });
    }
    return res.json(buildGroupedTree(categoryPath));
  }

  // No category given: not currently used by the frontend (it always passes
  // one), kept only so the route still resolves sensibly if called directly.
  if (!fs.existsSync(semesterPath)) {
    return res.status(404).json({ error: 'folder not found' });
  }

  const categoryFolders = fs.readdirSync(semesterPath)
    .filter(item => fs.statSync(path.join(semesterPath, item)).isDirectory())
    .sort()
    .map(name => ({ name, type: 'folder', children: [] }));

  res.json(categoryFolders);
});

app.listen(1717, () => console.log('server running on http://localhost:1717'));