const cells = document.querySelectorAll('.cell');
let currentPlayer = 'X';
let gameActive = true;
const winningCombinations = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

function handleCellClick(event) {
  const clickedCell = event.target;
  const clickedCellIndex = Array.from(cells).indexOf(clickedCell);
  if (gameActive && clickedCell.textContent === '') {
    clickedCell.textContent = currentPlayer;
    clickedCell.classList.add(currentPlayer === 'X' ? 'x' : 'o');
    if (checkForWin()) {
      alert(`${currentPlayer} ganó!`);
      gameActive = false;
      resetGame();
      return;
    }
    if (checkForDraw()) {
      alert("Empate!");
      gameActive = false;
      resetGame();
      return;
    }
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
  }
}

function checkForWin() {
  return winningCombinations.some(combination => {
    return combination.every(index => {
      return cells[index].textContent === currentPlayer;
    });
  });
}

function checkForDraw() {
  return [...cells].every(cell => cell.textContent !== '') && !checkForWin();
}

cells.forEach(cell => {
  cell.addEventListener('click', handleCellClick);
});

function resetGame() {
    cells.forEach(cell => cell.textContent = '');
    currentPlayer = 'X';
    gameActive = true;
}