self.onmessage = function(e) {
  const { imageData, gridColumns, gridRows } = e.data;
  const gridCellColors = extractGridColors(imageData, gridColumns, gridRows);
  self.postMessage(gridCellColors);
};

function extractGridColors(imageData, gridColumns, gridRows) {
  const cellWidth = imageData.width / gridColumns;
  const cellHeight = imageData.height / gridRows;
  const gridCellColors = [];

  for (let y = 0; y < gridRows; y++) {
    for (let x = 0; x < gridColumns; x++) {
      const startX = Math.floor(x * cellWidth);
      const startY = Math.floor(y * cellHeight);
      const endX = Math.floor((x + 1) * cellWidth);
      const endY = Math.floor((y + 1) * cellHeight);
      const cellColor = getDominantColor(imageData, startX, startY, endX - startX, endY - startY);
      gridCellColors.push(cellColor);
    }
  }

  return gridCellColors;
}

function getDominantColor(imageData, startX, startY, width, height) {
  let r = 0, g = 0, b = 0, count = 0;
  const endX = Math.min(startX + width, imageData.width);
  const endY = Math.min(startY + height, imageData.height);

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const index = (y * imageData.width + x) * 4;
      r += imageData.data[index];
      g += imageData.data[index + 1];
      b += imageData.data[index + 2];
      count++;
    }
  }

  return count > 0 ? [
    Math.round(r / count),
    Math.round(g / count),
    Math.round(b / count)
  ] : [0, 0, 0];
}