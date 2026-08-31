// ===== Ghost 2048 — vanilla JS game logic =====
// Board is a 4x4 array of numbers (0 = empty).
// Kept the state simple: one array of arrays, re-rendered fully each move.

const SIZE = 4;
const STORAGE_BEST_KEY = 'ghost2048_best';

let board = [];          // current tile values
let score = 0;
let bestScore = 0;
let hasWon = false;      // whether win modal already shown this game
let isAnimating = false; // basic lock so rapid key spam doesn't corrupt state

// DOM refs
const boardEl = document.getElementById('game-board');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('best-score');
const newGameBtn = document.getElementById('new-game-btn');
const winModal = document.getElementById('win-modal');
const gameoverModal = document.getElementById('gameover-modal');
const winRestartBtn = document.getElementById('win-restart-btn');
const winContinueBtn = document.getElementById('win-continue-btn');
const gameoverRestartBtn = document.getElementById('gameover-restart-btn');

// ---- Init ----
function init() {
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  score = 0;
  hasWon = false;
  isAnimating = false;
  loadBestScore();
  updateScore();
  hideModals();
  spawnTile();
  spawnTile();
  render();
}

// ---- Spawn a new tile (90% chance 2, 10% chance 4) ----
function spawnTile() {
  const empties = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) empties.push({ r, c });
    }
  }
  if (empties.length === 0) return;

  const spot = empties[Math.floor(Math.random() * empties.length)];
  board[spot.r][spot.c] = Math.random() < 0.9 ? 2 : 4;
  return spot; // returned so render() knows which cell to animate as "spawned"
}

// ---- Core move logic ----
// Direction: 'up' | 'down' | 'left' | 'right'
// Strategy: for each row/column, slide non-zero values together, then merge
// adjacent equal pairs once (left-to-right in the direction of travel).
function move(direction) {
  if (isAnimating) return;

  const previousBoard = JSON.stringify(board);
  let moved = false;
  let mergedThisMove = []; // track {r,c} of merge results, for pulse animation

  // Helper: compress + merge a single line (array of 4 values), moving toward index 0
  function processLine(line) {
    const original = [...line];
    let filtered = line.filter(v => v !== 0);
    const mergedFlags = new Array(filtered.length).fill(false);

    for (let i = 0; i < filtered.length - 1; i++) {
      if (filtered[i] !== 0 && filtered[i] === filtered[i + 1]) {
        filtered[i] *= 2;
        score += filtered[i];
        filtered[i + 1] = 0;
        mergedFlags[i] = true;
        i++; // skip the tile we just consumed
      }
    }
    filtered = filtered.filter(v => v !== 0);
    while (filtered.length < SIZE) filtered.push(0);

    const changed = original.some((v, idx) => v !== filtered[idx]);
    return { line: filtered, changed };
  }

  if (direction === 'left' || direction === 'right') {
    for (let r = 0; r < SIZE; r++) {
      let row = [...board[r]];
      if (direction === 'right') row.reverse();
      const result = processLine(row);
      let newRow = result.line;
      if (direction === 'right') newRow.reverse();
      if (result.changed) moved = true;
      board[r] = newRow;
    }
  } else {
    for (let c = 0; c < SIZE; c++) {
      let col = [];
      for (let r = 0; r < SIZE; r++) col.push(board[r][c]);
      if (direction === 'down') col.reverse();
      const result = processLine(col);
      let newCol = result.line;
      if (direction === 'down') newCol.reverse();
      if (result.changed) moved = true;
      for (let r = 0; r < SIZE; r++) board[r][c] = newCol[r];
    }
  }

  if (!moved) return; // nothing shifted — invalid move, don't spawn or re-render

  isAnimating = true;
  const newSpot = spawnTile();
  updateScore();
  render(newSpot);

  // small delay lets the CSS transition finish before we check end states
  setTimeout(() => {
    isAnimating = false;
    checkWin();
    checkGameOver();
  }, 150);
}

// ---- Win check ----
function checkWin() {
  if (hasWon) return;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 2048) {
        hasWon = true;
        winModal.classList.add('active');
        return;
      }
    }
  }
}

// ---- Game over check: no empty cells AND no adjacent equal neighbors ----
function checkGameOver() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) return false;
      const right = c < SIZE - 1 ? board[r][c + 1] : null;
      const down = r < SIZE - 1 ? board[r + 1][c] : null;
      if (right === board[r][c] || down === board[r][c]) return false;
    }
  }
  gameoverModal.classList.add('active');
  return true;
}

// ---- Score handling ----
function updateScore() {
  scoreEl.textContent = score;
  if (score > bestScore) {
    bestScore = score;
    bestScoreEl.textContent = bestScore;
    saveBestScore();
  }
}

function loadBestScore() {
  const stored = localStorage.getItem(STORAGE_BEST_KEY);
  bestScore = stored ? parseInt(stored, 10) : 0;
  bestScoreEl.textContent = bestScore;
}

function saveBestScore() {
  localStorage.setItem(STORAGE_BEST_KEY, String(bestScore));
}

// ---- Rendering ----
// Rebuilds the board fully each time — simplest approach for a 4x4 grid,
// performance is a non-issue at this scale.
function render(spawnSpot) {
  boardEl.innerHTML = '';

  // background cells (the empty "slots")
  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    boardEl.appendChild(cell);
  }

  // figure out tile size/position based on board's actual rendered size
  const boardRect = boardEl.getBoundingClientRect();
  const gapPx = parseFloat(getComputedStyle(boardEl).gap) || 12;
  const paddingPx = parseFloat(getComputedStyle(boardEl).paddingLeft) || 12;
  const innerSize = boardRect.width - paddingPx * 2;
  const tileSize = (innerSize - gapPx * (SIZE - 1)) / SIZE;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const value = board[r][c];
      if (value === 0) continue;

      const tile = document.createElement('div');
      tile.className = `tile ${value > 2048 ? 'tile-super' : 'tile-' + value}`;
      tile.textContent = value;
      tile.style.width = `${tileSize}px`;
      tile.style.height = `${tileSize}px`;
      tile.style.left = `${c * (tileSize + gapPx)}px`;
      tile.style.top = `${r * (tileSize + gapPx)}px`;

      if (spawnSpot && spawnSpot.r === r && spawnSpot.c === c) {
        tile.classList.add('tile-spawn');
      }

      boardEl.appendChild(tile);
    }
  }
}

// ---- Modal helpers ----
function hideModals() {
  winModal.classList.remove('active');
  gameoverModal.classList.remove('active');
}

// ---- Keyboard controls: arrows + WASD ----
document.addEventListener('keydown', (e) => {
  const keyMap = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right'
  };
  const dir = keyMap[e.key];
  if (dir) {
    e.preventDefault(); // stop page scroll on arrow keys
    move(dir);
  }
});

// ---- Swipe controls (touch) ----
let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 30; // minimum px to count as an intentional swipe

boardEl.addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });

boardEl.addEventListener('touchend', (e) => {
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;

  if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;

  if (Math.abs(dx) > Math.abs(dy)) {
    move(dx > 0 ? 'right' : 'left');
  } else {
    move(dy > 0 ? 'down' : 'up');
  }
}, { passive: true });

// ---- Button handlers ----
newGameBtn.addEventListener('click', init);
winRestartBtn.addEventListener('click', init);
gameoverRestartBtn.addEventListener('click', init);
winContinueBtn.addEventListener('click', () => {
  // let the player keep playing past 2048 without resetting
  winModal.classList.remove('active');
});

// re-render on resize so tile positions stay lined up with the board
window.addEventListener('resize', () => render());

// ---- Kick things off ----
init();