import React from "react";
import "./PuzzleIcon.css";

// 5x3 bitmap font for digits 0-9 (each row is 3 bools, 5 rows tall)
const DIGIT_BITMAPS = {
  0: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  1: [
    [0, 1, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [1, 1, 1],
  ],
  2: [
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
  ],
  3: [
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  4: [
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1],
  ],
  5: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  6: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  7: [
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1],
    [0, 0, 1],
    [0, 0, 1],
  ],
  8: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  9: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
};

const GRID_SIZE = 9;
const DIGIT_HEIGHT = 5;
const DIGIT_WIDTH = 3;
const DIGIT_GAP = 1;

function buildGrid(number) {
  // Start with all-yellow 10x10 grid
  const grid = Array.from({ length: GRID_SIZE }, () =>
    Array(GRID_SIZE).fill(false)
  );

  const digits = String(number).split("").map(Number);
  const totalWidth = digits.length * DIGIT_WIDTH + (digits.length - 1) * DIGIT_GAP;

  // Center horizontally and vertically
  const startCol = Math.floor((GRID_SIZE - totalWidth) / 2);
  const startRow = Math.floor((GRID_SIZE - DIGIT_HEIGHT) / 2);

  digits.forEach((d, i) => {
    const bitmap = DIGIT_BITMAPS[d];
    const colOffset = startCol + i * (DIGIT_WIDTH + DIGIT_GAP);
    for (let r = 0; r < DIGIT_HEIGHT; r++) {
      for (let c = 0; c < DIGIT_WIDTH; c++) {
        if (bitmap[r][c]) {
          const gr = startRow + r;
          const gc = colOffset + c;
          if (gr >= 0 && gr < GRID_SIZE && gc >= 0 && gc < GRID_SIZE) {
            grid[gr][gc] = true;
          }
        }
      }
    }
  });

  return grid;
}

export default function PuzzleIcon({ number }) {
  const grid = React.useMemo(() => buildGrid(number), [number]);

  return (
    <div
      className="puzzle-icon"
      style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}
    >
      {grid.flatMap((row, r) =>
        row.map((dark, c) => (
          <div
            key={`${r}-${c}`}
            className={`puzzle-icon-cell${dark ? " dark" : ""}`}
          />
        ))
      )}
    </div>
  );
}
