// DOM references

const modeSelect = document.getElementById('mode');

const gradeSelect = document.getElementById('grade');
const semesterSelect = document.getElementById('semester');
const categorySelect = document.getElementById('category');

const treeContainer = document.getElementById('tree');

const practiceMode = document.getElementById('practice-mode');
const testMode = document.getElementById('test-mode');

const player = document.getElementById('player');
const durationInput = document.getElementById('duration-input');
const idFilterInput = document.getElementById('id-filter-input');
const forceStartInput = document.getElementById('force-start-input');
const guessInput = document.getElementById('guess-input');
const guessBtn = document.getElementById('guess-btn');
const pauseBtn = document.getElementById('pause-btn');
const feedback = document.getElementById('feedback');
const practiceStartBtn = document.getElementById('practice-start-btn');
const practicePlayer = document.getElementById('practice-player');

const testDurationInput = document.getElementById('test-duration-input');
const testCountInput = document.getElementById('test-count-input');
const testIdFilterInput = document.getElementById('test-id-filter-input');
const testForceStartInput = document.getElementById('test-force-start-input');
const testGuessInput = document.getElementById('test-guess-input');
const testGuessBtn = document.getElementById('test-guess-btn');
const testFeedback = document.getElementById('test-feedback');
const testProgress = document.getElementById('test-progress');
const testResults = document.getElementById('test-results');
const testStartBtn = document.getElementById('test-start-btn');
const testStopBtn = document.getElementById('test-stop-btn');
const testPlayer = document.getElementById('test-player');

const audioSource = document.getElementById('audio-source');
const nowPlaying = document.getElementById('now-playing');

const audio = audioSource.parentElement;

audio.addEventListener('error', () => {
    console.error('audio error event:', audio.error);
});


// Helpers

function normalizeId(id) {
    return String(parseInt(id) || 0);
}

/**
 * Group names look like "01_opera".
 * Extracts the leading numeric id for comparison.
 */
function extractGroupId(groupName) {
    if (!groupName) return null;

    const match = String(groupName).match(/^(\d+)/);

    return match ? match[1] : null;
}

/**
 * Reads which radio ("track" or "group") is currently selected.
 */
function getGuessMode(radioName) {
    const checked = document.querySelector(
        `input[name="${radioName}"]:checked`
    );

    return checked ? checked.value : 'track';
}

function getShuffleMode(radioName) {
    const checked = document.querySelector(
        `input[name="${radioName}"]:checked`
    );

    return checked ? checked.value : 'shuffle-bag';
}

/**
 * Parses strings such as:
 * "3, 5-8, 12"
 *
 * Returns an array of normalized ID strings.
 */
function parseFilterIds(filterText) {
    const ids = [];

    filterText.split(',').forEach(rawPart => {
        const part = rawPart.trim();

        if (!part) return;

        if (part.includes('-')) {
            const [start, end] = part
                .split('-')
                .map(s => parseInt(s.trim()) || 0);

            for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
                ids.push(String(i));
            }
        } else {
            ids.push(normalizeId(part));
        }
    });

    return ids;
}

function currentSelection() {
    return {
        grade: gradeSelect.value,
        semester: semesterSelect.value,
        category: categorySelect.value,
    };
}

/**
 * Fetches the file list for the current grade/semester/category
 * and applies an ID filter.
 */
async function fetchFilteredFiles(filterInputValue) {
    const { grade, semester, category } = currentSelection();

    const response = await fetch(
        `/api/files/${grade}/${semester}/${category}`
    );

    let files = await response.json();

    const filterText = filterInputValue.trim();

    if (filterText) {
        const allowedIds = parseFilterIds(filterText);

        files = files.filter(f =>
            allowedIds.includes(normalizeId(f.trackId))
        );
    }

    return files;
}

/**
 * Fetches an audio clip for a file and returns a playable object URL.
 */
async function fetchClipUrl(file, durationValue, forceStartInputValue) {
    const { grade, semester, category } = currentSelection();

    const forceStartIds = parseFilterIds(forceStartInputValue.trim());

    const forceStart = forceStartIds.includes(normalizeId(file.trackId));

    const response = await fetch(
        `/api/clip/${grade}/${semester}/${category}/${encodeURIComponent(file.filename)}` +
        `?duration=${durationValue}&forceStart=${forceStart}`
    );

    if (!response.ok) {
        throw new Error(`clip request failed: ${response.status}`);
    }

    const blob = await response.blob();

    return URL.createObjectURL(blob);
}

function stopAllAudio() {
    audio.pause();

    stopClip(practiceSession);
    stopClip(testSession);
}

/**
 * Stops and discards currently playing clip.
 * Increments the token to prevent multiple clips overlapping.
 */
function stopClip(session) {
    if (session.clipAudio) {
        session.clipAudio.pause();

        if (session.clipAudio.src.startsWith('blob:')) {
            URL.revokeObjectURL(session.clipAudio.src);
        }

        session.clipAudio = null;
    }

    session.token = (session.token || 0) + 1;

    return session.token;
}


// Shuffling

/**
 * Clears a session's shuffle bag.
 */
function resetShuffleBag(session) {
    session.shuffleBag = [];
    session.lastPickedFile = null;
    session.shuffleMode = null;
}

/**
 * Selects the next file according to the chosen shuffling mechanism.
 *
 * shuffle-bag:
 * Every file is played once per bag, in a shuffled order.
 *
 * random:
 * A file is independently selected at random every time.
 * Repetitions are possible.
 */
function pickNextFile(session, shuffleMode) {
    if (session.files.length === 0) {
        return null;
    }

    // Reset the bag when the selected mechanism changes.
    if (session.shuffleMode !== shuffleMode) {
        session.shuffleMode = shuffleMode;
        session.shuffleBag = [];
    }

    // Completely random selection, with replacement.
    if (shuffleMode === 'random') {
        const randomIdx = Math.floor(
            Math.random() * session.files.length
        );

        const file = session.files[randomIdx];

        session.lastPickedFile = file;

        return file;
    }

    // Refill the bag when all files have been used.
    if (session.shuffleBag.length === 0) {
        session.shuffleBag = [...session.files];

        // Fisher-Yates shuffle.
        for (let i = session.shuffleBag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));

            [
                session.shuffleBag[i],
                session.shuffleBag[j]
            ] = [
                session.shuffleBag[j],
                session.shuffleBag[i]
            ];
        }

        // Prevent consecutive repetitions between bags.
        const lastIndex = session.shuffleBag.length - 1;

        if (
            session.shuffleBag.length > 1 &&
            session.shuffleBag[lastIndex] === session.lastPickedFile
        ) {
            const swapIndex = Math.floor(Math.random() * lastIndex);

            [
                session.shuffleBag[lastIndex],
                session.shuffleBag[swapIndex]
            ] = [
                session.shuffleBag[swapIndex],
                session.shuffleBag[lastIndex]
            ];
        }
    }

    const file = session.shuffleBag.pop();

    session.lastPickedFile = file;

    return file;
}


// File tree (learning mode)

async function loadCategories() {
    const { grade, semester } = currentSelection();

    try {
        const response = await fetch(
            `/api/categories/${grade}/${semester}`
        );

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

            const childUl = renderTree(
                item.children,
                level + 1,
                itemPath
            );

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
                    const { grade, semester, category } = currentSelection();

                    const filePath =
                        `/music_files/grade_${grade}/semester_${semester}/${category}/${item.name}`;

                    audioSource.src = filePath;

                    audio.load();

                    nowPlaying.textContent = `now playing: ${item.name}`;

                    audio.play().catch(err => {
                        console.error('play error:', err);
                    });
                });
            }
        }

        ul.appendChild(li);
    });

    return ul;
}

async function loadTree() {
    const { grade, semester, category } = currentSelection();

    if (!category) {
        treeContainer.innerHTML = '';
        return;
    }

    try {
        const response = await fetch(
            `/api/tree/${grade}/${semester}/${category}`
        );

        const data = await response.json();

        treeContainer.innerHTML = '';

        treeContainer.appendChild(renderTree(data));
    } catch (error) {
        console.error('error loading tree:', error);

        treeContainer.innerHTML = '<p>error loading tree</p>';
    }
}


// Practice mode

const practiceSession = {
    files: [],
    currentFile: null,
    clipAudio: null,
    token: 0,
    clipEnded: false,
    guessMode: 'track',

    shuffleBag: [],
    lastPickedFile: null,
    shuffleMode: null,
};

async function loadPracticeFiles() {
    if (!categorySelect.value) {
        feedback.textContent = 'no category selected';
        return;
    }

    try {
        practiceSession.files = await fetchFilteredFiles(
            idFilterInput.value
        );

        resetShuffleBag(practiceSession);

        if (practiceSession.files.length === 0) {
            feedback.textContent = 'no matching files found';
        }
    } catch (error) {
        console.error('error loading practice files:', error);

        feedback.textContent = 'error loading files';
    }
}

async function playNextClip() {
    const guessMode = getGuessMode('guess-mode');

    if (practiceSession.files.length === 0) {
        feedback.textContent = 'no files available';
        return;
    }

    practiceSession.currentFile = pickNextFile(
        practiceSession,
        getShuffleMode('practice-shuffle-mode')
    );

    practiceSession.guessMode = guessMode;

    // Get a new token.
    const token = stopClip(practiceSession);

    feedback.textContent = '';

    guessInput.value = '';

    guessInput.placeholder =
        guessMode === 'group'
            ? 'enter group id'
            : 'enter track id';

    guessInput.disabled = false;
    guessBtn.disabled = false;

    pauseBtn.textContent = 'pause';
    pauseBtn.style.display = 'inline-block';
    pauseBtn.disabled = false;

    practiceStartBtn.style.display = 'none';

    practiceSession.clipEnded = false;

    guessInput.focus();

    try {
        const url = await fetchClipUrl(
            practiceSession.currentFile,
            durationInput.value,
            forceStartInput.value
        );

        // Check if the token hasn't expired.
        if (token !== practiceSession.token) {
            URL.revokeObjectURL(url);
            return;
        }

        practiceSession.clipAudio = new Audio(url);

        practiceSession.clipAudio.play().catch(error => {
            console.error('audio playback error:', error);
            feedback.textContent = 'error playing clip';
        });

        practiceSession.clipAudio.onended = () => {
            practiceSession.clipEnded = true;

            pauseBtn.disabled = true;

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

    const guessMode = practiceSession.guessMode;

    const isCorrect = guessMode === 'group'
        ? normalizeId(guess) === normalizeId(
            extractGroupId(practiceSession.currentFile.group)
        )
        : normalizeId(guess) === normalizeId(
            practiceSession.currentFile.trackId
        );

    const answerNoun = guessMode === 'group' ? 'group' : 'id';

    const answerValue = guessMode === 'group'
        ? extractGroupId(practiceSession.currentFile.group)
        : practiceSession.currentFile.trackId;

    if (isCorrect) {
        feedback.textContent =
            `correct! ${answerNoun}: ${answerValue}`;

        feedback.style.color = '#0a0';

        guessInput.disabled = true;
        guessBtn.disabled = true;

        stopClip(practiceSession);

        setTimeout(playNextClip, 1500);
    } else if (practiceSession.clipEnded) {
        feedback.textContent =
            `wrong - correct ${answerNoun} was ${answerValue}`;

        feedback.style.color = '#a00';

        guessInput.disabled = true;
        guessBtn.disabled = true;

        stopClip(practiceSession);

        setTimeout(playNextClip, 1500);
    } else {
        feedback.textContent = 'wrong, try again';

        feedback.style.color = '#a00';

        guessInput.value = '';

        guessInput.focus();
    }
}


// Test mode

const testSession = {
    files: [],
    currentFile: null,
    clipAudio: null,

    correctCount: 0,
    currentCount: 0,
    totalCount: 10,

    token: 0,
    nextClipTimeoutId: null,

    guessMode: 'track',

    shuffleBag: [],
    lastPickedFile: null,
    shuffleMode: null,
};

async function loadTestFiles() {
    if (!categorySelect.value) {
        testFeedback.textContent = 'no category selected';

        testResults.style.display = 'none';

        return;
    }

    try {
        testSession.files = await fetchFilteredFiles(
            testIdFilterInput.value
        );

        resetShuffleBag(testSession);

        testSession.totalCount =
            parseInt(testCountInput.value) || 10;

        testSession.correctCount = 0;
        testSession.currentCount = 0;

        if (testSession.nextClipTimeoutId !== null) {
            clearTimeout(testSession.nextClipTimeoutId);

            testSession.nextClipTimeoutId = null;
        }

        if (testSession.files.length === 0) {
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
    testSession.currentCount++;

    const guessMode = getGuessMode('test-guess-mode');

    if (
        testSession.currentCount > testSession.totalCount ||
        testSession.files.length === 0
    ) {
        showTestResults();
        return;
    }

    testSession.currentFile = pickNextFile(
        testSession,
        getShuffleMode('test-shuffle-mode')
    );

    testSession.guessMode = guessMode;

    // Get a new token.
    const token = stopClip(testSession);

    testProgress.textContent =
        `song ${testSession.currentCount} of ${testSession.totalCount}`;

    testFeedback.textContent = '';

    testGuessInput.value = '';

    testGuessInput.placeholder =
        guessMode === 'group'
            ? 'enter group id'
            : 'enter track id';

    testGuessInput.disabled = false;
    testGuessInput.style.display = 'block';

    testGuessBtn.disabled = false;
    testGuessBtn.style.display = 'block';

    testResults.style.display = 'none';

    testGuessInput.focus();

    try {
        const url = await fetchClipUrl(
            testSession.currentFile,
            testDurationInput.value,
            testForceStartInput.value
        );

        // Check if the token hasn't expired.
        if (token !== testSession.token) {
            URL.revokeObjectURL(url);
            return;
        }

        testSession.clipAudio = new Audio(url);

        testSession.clipAudio.play().catch(error => {
            console.error('audio playback error:', error);
            testFeedback.textContent = 'error playing clip';
        });

        testSession.clipAudio.onended = () => {
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

    const guessMode = testSession.guessMode;

    const isCorrect = guessMode === 'group'
        ? normalizeId(guess) === normalizeId(
            extractGroupId(testSession.currentFile.group)
        )
        : normalizeId(guess) === normalizeId(
            testSession.currentFile.trackId
        );

    const answerNoun = guessMode === 'group' ? 'group' : 'id';

    const answerValue = guessMode === 'group'
        ? extractGroupId(testSession.currentFile.group)
        : testSession.currentFile.trackId;

    if (isCorrect) {
        testFeedback.textContent =
            `correct! ${answerNoun}: ${answerValue}`;

        testFeedback.style.color = '#0a0';

        testSession.correctCount++;
    } else {
        testFeedback.textContent =
            `wrong - correct ${answerNoun} was ${answerValue}`;

        testFeedback.style.color = '#a00';
    }

    testGuessInput.disabled = true;
    testGuessBtn.disabled = true;

    stopClip(testSession);

    testSession.nextClipTimeoutId = setTimeout(
        playNextTestClip,
        1500
    );
}

function setTestControlsDisabled(disabled) {
    testDurationInput.disabled = disabled;
    testCountInput.disabled = disabled;
    testIdFilterInput.disabled = disabled;
    testForceStartInput.disabled = disabled;

    document.querySelectorAll(
        'input[name="test-guess-mode"], input[name="test-shuffle-mode"]'
    ).forEach(radio => {
        radio.disabled = disabled;
    });
}

function showTestResults() {
    const isError =
        testFeedback.textContent.includes('error') ||
        testFeedback.textContent.includes('no ');

    if (!isError) {
        testFeedback.textContent = '';

        testResults.innerHTML = `
            <div style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">
                results
            </div>

            <div>
                correct: ${testSession.correctCount} / ${testSession.totalCount}
            </div>
        `;

        testResults.style.display = 'block';
    }

    testProgress.textContent = '';

    testGuessInput.style.display = 'none';
    testGuessBtn.style.display = 'none';

    testStartBtn.style.display = 'block';
    testStopBtn.style.display = 'none';

    setTestControlsDisabled(false);
}


// Mode switching

async function applyMode(mode) {
    stopAllAudio();

    player.style.display =
        mode === 'learning' ? 'block' : 'none';

    practiceMode.style.display =
        mode === 'practice' ? 'block' : 'none';

    testMode.style.display =
        mode === 'test' ? 'block' : 'none';

    testStopBtn.style.display = 'none';

    setTestControlsDisabled(false);

    if (mode === 'practice') {
        practicePlayer.style.display = 'none';

        pauseBtn.style.display = 'none';

        practiceStartBtn.style.display = 'inline-block';
        practiceStartBtn.disabled = false;

        await loadTree();
        await loadPracticeFiles();
    } else if (mode === 'test') {
        testPlayer.style.display = 'none';

        testStartBtn.style.display = 'block';

        testResults.style.display = 'none';

        await loadTree();
        await loadTestFiles();
    } else {
        await loadTree();
    }
}


// Event listeners

gradeSelect.addEventListener('change', loadCategories);

semesterSelect.addEventListener('change', loadCategories);

modeSelect.addEventListener('change', () => {
    applyMode(modeSelect.value);
});

categorySelect.addEventListener('change', async () => {
    const mode = modeSelect.value;

    loadTree();

    if (mode === 'practice') {
        await loadPracticeFiles();
    } else if (mode === 'test') {
        await loadTestFiles();
    }
});

guessBtn.addEventListener('click', submitGuess);

guessInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') {
        submitGuess();
    }
});

pauseBtn.addEventListener('click', () => {
    if (
        !practiceSession.clipAudio ||
        practiceSession.clipEnded
    ) {
        return;
    }

    if (practiceSession.clipAudio.paused) {
        practiceSession.clipAudio.play();

        pauseBtn.textContent = 'pause';
    } else {
        practiceSession.clipAudio.pause();

        pauseBtn.textContent = 'resume';
    }
});

testGuessBtn.addEventListener('click', submitTestGuess);

testGuessInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') {
        submitTestGuess();
    }
});

practiceStartBtn.addEventListener('click', async () => {
    if (practiceStartBtn.disabled) return;

    practiceStartBtn.disabled = true;

    try {
        await loadPracticeFiles();

        if (practiceSession.files.length === 0) {
            return;
        }

        practicePlayer.style.display = 'block';

        pauseBtn.style.display = 'none';

        practiceStartBtn.style.display = 'inline-block';

        await playNextClip();
    } finally {
        practiceStartBtn.disabled = false;
    }
});

testStartBtn.addEventListener('click', async () => {
    testStartBtn.style.display = 'none';
    testStopBtn.style.display = 'block';

    setTestControlsDisabled(true);

    await loadTestFiles();

    if (testSession.files.length === 0) {
        showTestResults();
        return;
    }

    testPlayer.style.display = 'block';

    playNextTestClip();
});

testStopBtn.addEventListener('click', () => {
    // Cancel any queued playNextTestClip call.
    if (testSession.nextClipTimeoutId !== null) {
        clearTimeout(testSession.nextClipTimeoutId);

        testSession.nextClipTimeoutId = null;
    }

    // Stop current playback and invalidate all tokens.
    stopClip(testSession);

    showTestResults();
});

idFilterInput.addEventListener('change', loadPracticeFiles);

testIdFilterInput.addEventListener('change', loadTestFiles);

testCountInput.addEventListener('change', () => {
    testSession.totalCount =
        parseInt(testCountInput.value) || 10;
});


// Init

player.style.display =
    modeSelect.value === 'learning' ? 'block' : 'none';

practiceMode.style.display =
    modeSelect.value === 'practice' ? 'block' : 'none';

testMode.style.display =
    modeSelect.value === 'test' ? 'block' : 'none';

practicePlayer.style.display = 'none';
testPlayer.style.display = 'none';

loadCategories();