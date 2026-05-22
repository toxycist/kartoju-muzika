const modeSelect = document.getElementById('mode');
const gradeSelect = document.getElementById('grade');
const semesterSelect = document.getElementById('semester');
const categorySelect = document.getElementById('category');
const treeContainer = document.getElementById('tree');
const audioSource = document.getElementById('audio-source');
const nowPlaying = document.getElementById('now-playing');
const audio = audioSource.parentElement;

console.log('audio element:', audio);
console.log('audio source:', audioSource);

audio.addEventListener('error', (e) => {
  console.error('audio error event:', audio.error);
});

async function loadCategories() {
  const grade = gradeSelect.value;
  const semester = semesterSelect.value;

  try {
    const response = await fetch(`/api/categories/${grade}/${semester}`);
    const categories = await response.json();
    categorySelect.innerHTML = '';
    categories.forEach(category => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    });
    if (categories.length > 0) {
      categorySelect.value = categories[0];
      loadTree();
    }
  } catch (error) {
    console.error('error loading categories:', error);
    categorySelect.innerHTML = '';
  }
}

function renderTree(items, level = 0, path = '') {
  const ul = document.createElement('ul');
  ul.style.marginLeft = level > 0 ? '20px' : '0';

  items.forEach(item => {
    const li = document.createElement('li');
    li.className = item.type;
    const itemPath = `${path}/${item.name}`;

    if (item.type === 'folder' && item.children?.length > 0) {
      const span = document.createElement('span');
      span.textContent = item.name;
      span.className = 'folder-label';
      li.appendChild(span);

      const childUl = renderTree(item.children, level + 1, itemPath);
      childUl.classList.add('collapsed');
      li.classList.add('collapsed');
      li.appendChild(childUl);

      span.addEventListener('click', () => {
        li.classList.toggle('collapsed');
        childUl.classList.toggle('collapsed');
      });
    } else {
      li.textContent = item.name;
      if (item.type === 'file') {
        li.style.cursor = 'pointer';
        li.addEventListener('click', () => {
          const grade = gradeSelect.value;
          const semester = semesterSelect.value;
          const category = categorySelect.value;
          const filePath = `/music_files/grade_${grade}/semester_${semester}/${category}${itemPath}`;
          console.log('playing:', filePath);
          audioSource.src = filePath;
          audio.load();
          nowPlaying.textContent = `now playing: ${item.name}`;
          audio.play().catch(err => console.error('play error:', err));
        });
      }
    }

    ul.appendChild(li);
  });

  return ul;
}

async function loadTree() {
  const grade = gradeSelect.value;
  const semester = semesterSelect.value;
  const category = categorySelect.value;

  if (!category) {
    treeContainer.innerHTML = '';
    return;
  }

  try {
    const response = await fetch(`/api/tree/${grade}/${semester}/${category}`);
    const data = await response.json();
    treeContainer.innerHTML = '';
    treeContainer.appendChild(renderTree(data));
  } catch (error) {
    treeContainer.innerHTML = '<p>error loading tree</p>';
  }
}

gradeSelect.addEventListener('change', loadCategories);
semesterSelect.addEventListener('change', loadCategories);
categorySelect.addEventListener('change', loadTree);
modeSelect.addEventListener('change', () => {
  console.log('mode changed to:', modeSelect.value);
});

loadCategories();
