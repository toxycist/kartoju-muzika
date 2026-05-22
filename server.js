const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const baseDir = path.join(__dirname, 'music_files');

app.use(express.static(__dirname));

app.get('/api/tree/:grade/:semester', (req, res) => {
  const { grade, semester } = req.params;
  const folderPath = path.join(baseDir, `grade_${grade}`, `semester_${semester}`);

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
