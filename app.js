const gradeSelect = document.getElementById('grade');
const semesterSelect = document.getElementById('semester');
const treeContainer = document.getElementById('tree');

function renderTree(items, level = 0) {
  const ul = document.createElement('ul');
  ul.style.marginLeft = level > 0 ? '20px' : '0';

  items.forEach(item => {
    const li = document.createElement('li');
    li.className = item.type;

    if (item.type === 'folder' && item.children?.length > 0) {
      const span = document.createElement('span');
      span.textContent = item.name;
      span.className = 'folder-label';
      li.appendChild(span);

      const childUl = renderTree(item.children, level + 1);
      childUl.classList.add('collapsed');
      li.classList.add('collapsed');
      li.appendChild(childUl);

      span.addEventListener('click', () => {
        li.classList.toggle('collapsed');
        childUl.classList.toggle('collapsed');
      });
    } else {
      li.textContent = item.name;
    }

    ul.appendChild(li);
  });

  return ul;
}

async function loadTree() {
  const grade = gradeSelect.value;
  const semester = semesterSelect.value;

  try {
    const response = await fetch(`/api/tree/${grade}/${semester}`);
    const data = await response.json();
    treeContainer.innerHTML = '';
    treeContainer.appendChild(renderTree(data));
  } catch (error) {
    treeContainer.innerHTML = '<p>error loading tree</p>';
  }
}

gradeSelect.addEventListener('change', loadTree);
semesterSelect.addEventListener('change', loadTree);

loadTree();
