const express = require('express');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
const baseDir = path.join(__dirname, 'music_files');

ffmpeg.setFfmpegPath('/usr/sbin/ffmpeg');

app.use(express.static(__dirname, {
  setHeaders: (res, path) => {
    if (path.endsWith('.mp3')) {
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
      const maxStart = Math.max(0, totalDuration - clipDuration);
      const startTime = maxStart > 0 ? Math.random() * maxStart : 0;

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

app.listen(3000, () => console.log('server running on http://localhost:3000'));

