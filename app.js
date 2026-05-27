const modeSelect = document.getElementById('mode');
const gradeSelect = document.getElementById('grade');
const semesterSelect = document.getElementById('semester');
const categorySelect = document.getElementById('category');
const treeContainer = document.getElementById('tree');
const practiceMode = document.getElementById('practice-mode');
const testMode = document.getElementById('test-mode');
const durationInput = document.getElementById('duration-input');
const idFilterInput = document.getElementById('id-filter-input');
const forceStartInput = document.getElementById('force-start-input');
const guessInput = document.getElementById('guess-input');
const guessBtn = document.getElementById('guess-btn');
const pauseBtn = document.getElementById('pause-btn');
const feedback = document.getElementById('feedback');
const testDurationInput = document.getElementById('test-duration-input');
const testCountInput = document.getElementById('test-count-input');
const testIdFilterInput = document.getElementById('test-id-filter-input');
const testForceStartInput = document.getElementById('test-force-start-input');
const testGuessInput = document.getElementById('test-guess-input');
const testGuessBtn = document.getElementById('test-guess-btn');
const testFeedback = document.getElementById('test-feedback');
const testProgress = document.getElementById('test-progress');
const testResults = document.getElementById('test-results');
const audioSource = document.getElementById('audio-source');
const nowPlaying = document.getElementById('now-playing');
const audio = audioSource.parentElement;
const player = document.getElementById('player');
const practiceStartBtn = document.getElementById('practice-start-btn');
const practicePlayer = document.getElementById('practice-player');
const testStartBtn = document.getElementById('test-start-btn');
const testStopBtn = document.getElementById('test-stop-btn');
const testPlayer = document.getElementById('test-player');

console.log('audio element:', audio);
console.log('audio source:', audioSource);

audio.addEventListener('error', (e) => {
  console.error('audio error event:', audio.error);
});

let practiceFiles = [];
let currentPracticeFile = null;
let clipAudio = null;
let testFiles = [];
let currentTestFile = null;
let testClipAudio = null;
let testCorrectCount = 0;
let testCurrentCount = 0;
let testTotalCount = 10;

function normalizeId(id) {
  return String(parseInt(id) || 0);
}

function parseFilterIds(filterText) {
  const parts = filterText.split(',');
  const ids = [];

  parts.forEach(part => {
    part = part.trim();
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(s => parseInt(s.trim()) || 0);
      for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
        ids.push(String(i));
      }
    } else if (part) {
      ids.push(normalizeId(part));
    }
  });

  return ids;
}

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
  const isLearningMode = modeSelect.value === 'learning';

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
      if (item.type === 'file' && isLearningMode) {
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

async function loadPracticeFiles() {
  const grade = gradeSelect.value;
  const semester = semesterSelect.value;
  const category = categorySelect.value;

  if (!category) {
    feedback.textContent = 'no category selected';
    return;
  }

  try {
    const response = await fetch(`/api/files/${grade}/${semester}/${category}`);
    let files = await response.json();

    const filterText = idFilterInput.value.trim();
    if (filterText) {
      const allowedIds = parseFilterIds(filterText);
      files = files.filter(f => allowedIds.includes(normalizeId(f.trackId)));
    }

    practiceFiles = files;
    if (files.length === 0) {
      feedback.textContent = 'no matching files found';
    }
  } catch (error) {
    console.error('error loading practice files:', error);
    feedback.textContent = 'error loading files';
  }
}

async function playNextClip() {
  if (practiceFiles.length === 0) {
    feedback.textContent = 'no files available';
    return;
  }

  const randomIdx = Math.floor(Math.random() * practiceFiles.length);
  currentPracticeFile = practiceFiles[randomIdx];

  const grade = gradeSelect.value;
  const semester = semesterSelect.value;
  const category = categorySelect.value;
  const duration = durationInput.value;

  const forceStartIds = parseFilterIds(forceStartInput.value.trim());
  const forceStart = forceStartIds.includes(normalizeId(currentPracticeFile.trackId));

  feedback.textContent = '';
  guessInput.value = '';
  guessInput.disabled = false;
  guessBtn.disabled = false;
  pauseBtn.textContent = 'pause';
  pauseBtn.style.display = 'inline-block';
  practiceStartBtn.style.display = 'none';
  guessInput.focus();

  try {
    const response = await fetch(
      `/api/clip/${grade}/${semester}/${category}/${encodeURIComponent(currentPracticeFile.filename)}?duration=${duration}&forceStart=${forceStart}`
    );
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    clipAudio = new Audio(url);

    clipAudio.play();
    clipAudio.onended = () => {
      if (guessInput.value === '') {
        guessInput.placeholder = 'enter your guess';
        guessInput.focus();
      }
    };
  } catch (error) {
    console.error('error playing clip:', error);
    feedback.textContent = 'error playing clip';
  }
}

function submitGuess() {
  const guess = guessInput.value.trim();
  if (!guess) return;

  const isCorrect = normalizeId(guess) === normalizeId(currentPracticeFile.trackId);
  if (isCorrect) {
    feedback.textContent = `correct! id: ${currentPracticeFile.trackId}`;
    feedback.style.color = '#0a0';
    guessInput.disabled = true;
    guessBtn.disabled = true;
    if (clipAudio) clipAudio.pause();

    setTimeout(() => {
      playNextClip();
    }, 1500);
  } else {
    feedback.textContent = `wrong, try again`;
    feedback.style.color = '#a00';
    guessInput.value = '';
    guessInput.focus();
  }
}

async function loadTestFiles() {
  const grade = gradeSelect.value;
  const semester = semesterSelect.value;
  const category = categorySelect.value;

  if (!category) {
    testFeedback.textContent = 'no category selected';
    testResults.style.display = 'none';
    return;
  }

  try {
    const response = await fetch(`/api/files/${grade}/${semester}/${category}`);
    let files = await response.json();

    const filterText = testIdFilterInput.value.trim();
    if (filterText) {
      const allowedIds = parseFilterIds(filterText);
      files = files.filter(f => allowedIds.includes(normalizeId(f.trackId)));
    }

    testFiles = files;
    testTotalCount = parseInt(testCountInput.value) || 10;
    testCorrectCount = 0;
    testCurrentCount = 0;

    if (files.length === 0) {
      testFeedback.textContent = 'no matching files found';
      testResults.style.display = 'none';
    }
  } catch (error) {
    console.error('error loading test files:', error);
    testFeedback.textContent = 'error loading files';
    testResults.style.display = 'none';
  }
}

async function playNextTestClip() {
  testCurrentCount++;
  if (testCurrentCount > testTotalCount || testFiles.length === 0) {
    showTestResults();
    return;
  }

  const randomIdx = Math.floor(Math.random() * testFiles.length);
  currentTestFile = testFiles[randomIdx];

  const grade = gradeSelect.value;
  const semester = semesterSelect.value;
  const category = categorySelect.value;
  const duration = testDurationInput.value;

  const forceStartIds = testForceStartInput.value.trim().split(',').map(s => normalizeId(s.trim()));
  const forceStart = forceStartIds.includes(normalizeId(currentTestFile.trackId));

  testProgress.textContent = `song ${testCurrentCount} of ${testTotalCount}`;
  testFeedback.textContent = '';
  testGuessInput.value = '';
  testGuessInput.disabled = false;
  testGuessInput.style.display = 'block';
  testGuessBtn.disabled = false;
  testGuessBtn.style.display = 'block';
  testResults.style.display = 'none';
  testGuessInput.focus();

  try {
    const response = await fetch(
      `/api/clip/${grade}/${semester}/${category}/${encodeURIComponent(currentTestFile.filename)}?duration=${duration}&forceStart=${forceStart}`
    );
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    testClipAudio = new Audio(url);

    testClipAudio.play();
    testClipAudio.onended = () => {
      if (testGuessInput.value === '') {
        testGuessInput.placeholder = 'enter your guess';
        testGuessInput.focus();
      }
    };
  } catch (error) {
    console.error('error playing clip:', error);
    testFeedback.textContent = 'error playing clip';
  }
}

function submitTestGuess() {
  const guess = testGuessInput.value.trim();
  if (!guess) return;

  const isCorrect = normalizeId(guess) === normalizeId(currentTestFile.trackId);
  if (isCorrect) {
    testFeedback.textContent = `correct! id: ${currentTestFile.trackId}`;
    testFeedback.style.color = '#0a0';
    testCorrectCount++;
  } else {
    testFeedback.textContent = `wrong — correct id was ${currentTestFile.trackId}`;
    testFeedback.style.color = '#a00';
  }

  testGuessInput.disabled = true;
  testGuessBtn.disabled = true;
  if (testClipAudio) testClipAudio.pause();

  setTimeout(() => {
    playNextTestClip();
  }, 1500);
}

function showTestResults() {
  const isError = testFeedback.textContent.includes('error') || testFeedback.textContent.includes('no ');

  if (!isError) {
    testFeedback.textContent = '';
    testResults.innerHTML = `
      <div style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">results</div>
      <div>correct: ${testCorrectCount} / ${testTotalCount}</div>
    `;
    testResults.style.display = 'block';
  }

  testProgress.textContent = '';
  testGuessInput.style.display = 'none';
  testGuessBtn.style.display = 'none';
  testStartBtn.style.display = 'block';
  testStopBtn.style.display = 'none';
  testDurationInput.disabled = false;
  testCountInput.disabled = false;
  testIdFilterInput.disabled = false;
  testForceStartInput.disabled = false;
}

gradeSelect.addEventListener('change', loadCategories);
semesterSelect.addEventListener('change', loadCategories);
modeSelect.addEventListener('change', async () => {
  audio.pause();
  if (clipAudio) clipAudio.pause();
  if (testClipAudio) testClipAudio.pause();

  const mode = modeSelect.value;
  if (mode === 'practice') {
    player.style.display = 'none';
    practiceMode.style.display = 'block';
    testMode.style.display = 'none';
    practicePlayer.style.display = 'none';
    pauseBtn.style.display = 'none';
    practiceStartBtn.style.display = 'inline-block';
    testStopBtn.style.display = 'none';
    loadTree();
    await loadPracticeFiles();
  } else if (mode === 'test') {
    player.style.display = 'none';
    practiceMode.style.display = 'none';
    testMode.style.display = 'block';
    testPlayer.style.display = 'none';
    testStartBtn.style.display = 'block';
    testResults.style.display = 'none';
    testStopBtn.style.display = 'none';
    testDurationInput.disabled = false;
    testCountInput.disabled = false;
    testIdFilterInput.disabled = false;
    testForceStartInput.disabled = false;
    loadTree();
    await loadTestFiles();
  } else {
    practiceMode.style.display = 'none';
    testMode.style.display = 'none';
    player.style.display = 'block';
    testStopBtn.style.display = 'none';
    testDurationInput.disabled = false;
    testCountInput.disabled = false;
    testIdFilterInput.disabled = false;
    testForceStartInput.disabled = false;
    loadTree();
  }
});

categorySelect.addEventListener('change', async () => {
  const mode = modeSelect.value;
  if (mode === 'practice') {
    loadTree();
    await loadPracticeFiles();
  } else if (mode === 'test') {
    loadTree();
    await loadTestFiles();
  } else {
    loadTree();
  }
});
modeSelect.addEventListener('change', async () => {
  audio.pause();
  if (clipAudio) clipAudio.pause();
  if (testClipAudio) testClipAudio.pause();

  const mode = modeSelect.value;
  if (mode === 'practice') {
    player.style.display = 'none';
    practiceMode.style.display = 'block';
    testMode.style.display = 'none';
    practicePlayer.style.display = 'none';
    pauseBtn.style.display = 'none';
    practiceStartBtn.style.display = 'inline-block';
    testStopBtn.style.display = 'none';
    loadTree();
    await loadPracticeFiles();
  } else if (mode === 'test') {
    player.style.display = 'none';
    practiceMode.style.display = 'none';
    testMode.style.display = 'block';
    testPlayer.style.display = 'none';
    testStartBtn.style.display = 'block';
    testResults.style.display = 'none';
    testStopBtn.style.display = 'none';
    testDurationInput.disabled = false;
    testCountInput.disabled = false;
    testIdFilterInput.disabled = false;
    testForceStartInput.disabled = false;
    loadTree();
    await loadTestFiles();
  } else {
    practiceMode.style.display = 'none';
    testMode.style.display = 'none';
    player.style.display = 'block';
    testStopBtn.style.display = 'none';
    testDurationInput.disabled = false;
    testCountInput.disabled = false;
    testIdFilterInput.disabled = false;
    testForceStartInput.disabled = false;
    loadTree();
  }
});

guessBtn.addEventListener('click', submitGuess);
guessInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') submitGuess();
});

pauseBtn.addEventListener('click', () => {
  if (clipAudio.paused) {
    clipAudio.play();
    pauseBtn.textContent = 'pause';
  } else {
    clipAudio.pause();
    pauseBtn.textContent = 'resume';
  }
});

testGuessBtn.addEventListener('click', submitTestGuess);
testGuessInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') submitTestGuess();
});

practiceStartBtn.addEventListener('click', async () => {
  await loadPracticeFiles();
  practicePlayer.style.display = 'block';
  pauseBtn.style.display = 'none';
  practiceStartBtn.style.display = 'inline-block';
  playNextClip();
});

testStartBtn.addEventListener('click', async () => {
  testStartBtn.style.display = 'none';
  testStopBtn.style.display = 'block';
  testDurationInput.disabled = true;
  testCountInput.disabled = true;
  testIdFilterInput.disabled = true;
  testForceStartInput.disabled = true;
  await loadTestFiles();
  testPlayer.style.display = 'block';
  playNextTestClip();
});

testStopBtn.addEventListener('click', () => {
  if (testClipAudio) testClipAudio.pause();
  showTestResults();
});

idFilterInput.addEventListener('change', loadPracticeFiles);
testIdFilterInput.addEventListener('change', loadTestFiles);
testCountInput.addEventListener('change', () => {
  testTotalCount = parseInt(testCountInput.value) || 10;
});

// Initialize display based on initial mode
if (modeSelect.value === 'practice') {
  player.style.display = 'none';
  practiceMode.style.display = 'block';
  testMode.style.display = 'none';
  practicePlayer.style.display = 'none';
} else if (modeSelect.value === 'test') {
  player.style.display = 'none';
  practiceMode.style.display = 'none';
  testMode.style.display = 'block';
  testPlayer.style.display = 'none';
} else {
  practiceMode.style.display = 'none';
  testMode.style.display = 'none';
  player.style.display = 'block';
}

loadCategories();
