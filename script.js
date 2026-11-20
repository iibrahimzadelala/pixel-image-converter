const grid = document.getElementById('grid');
const colorPicker = document.getElementById('colorPicker');
const gridSizeSelect = document.getElementById('gridSizeSelect');
const brushBtn = document.getElementById('brushBtn');
const eraserBtn = document.getElementById('eraserBtn');
const clearBtn = document.getElementById('clearBtn');
const copyBtn = document.getElementById('copyBtn');
const uploadInput = document.getElementById('uploadInput');
const previewPixel = document.getElementById('preview-pixel');
const cssOutput = document.getElementById('cssOutput');
const recentColorsContainer = document.getElementById('recentColors');

const RECENT_COLORS_KEY = 'pixelBoxShadowRecentColors';
const MAX_RECENT_COLORS = 12;

let SIZE = parseInt(gridSizeSelect.value);
let CENTER = Math.floor(SIZE / 2);

let isDrawing = false;
let mode = 'brush'; // 'brush' или 'eraser'
let cells = [];
let recentColors = loadRecentColors();

function normalizeHex(color) {
  if (!color || typeof color !== 'string') return null;
  const trimmed = color.trim().toUpperCase();

  if (/^#[0-9A-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9A-F]{3}$/.test(trimmed)) {
    return '#' + trimmed.slice(1).split('').map((ch) => ch + ch).join('');
  }
  return null;
}

function loadRecentColors() {
  try {
    const raw = localStorage.getItem(RECENT_COLORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeHex).filter(Boolean).slice(0, MAX_RECENT_COLORS);
  } catch {
    return [];
  }
}

function saveRecentColors() {
  try {
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(recentColors));
  } catch {
    // Игнорируем ошибки доступа к localStorage
  }
}

function addRecentColor(color) {
  const hex = normalizeHex(color);
  if (!hex) return;

  recentColors = [
    hex,
    ...recentColors.filter((item) => item !== hex),
  ].slice(0, MAX_RECENT_COLORS);

  saveRecentColors();
  renderRecentColors();
}

function renderRecentColors() {
  if (!recentColorsContainer) return;

  const activeHex = normalizeHex(colorPicker.value);
  recentColorsContainer.innerHTML = '';

  recentColors.forEach((hex) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-swatch';
    if (hex === activeHex) {
      btn.classList.add('is-active');
    }
    btn.style.backgroundColor = hex;
    btn.title = hex;
    btn.setAttribute('aria-label', `Выбрать цвет ${hex}`);

    btn.addEventListener('click', () => {
      colorPicker.value = hex.toLowerCase();
      if (mode === 'eraser') {
        mode = 'brush';
        brushBtn.classList.add('active');
        eraserBtn.classList.remove('active');
      }
      renderRecentColors();
    });

    recentColorsContainer.appendChild(btn);
  });
}

function initGrid(newSize) {
  SIZE = newSize;
  CENTER = Math.floor(SIZE / 2);
  grid.innerHTML = '';
  cells = [];

  grid.style.gridTemplateColumns = `repeat(${SIZE}, min(18px, ${Math.max(10, 65 / SIZE)}vw))`;
  grid.style.gridTemplateRows = `repeat(${SIZE}, min(18px, ${Math.max(10, 65 / SIZE)}vw))`;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = document.createElement('div');
      cell.classList.add('cell');
      if (x === CENTER && y === CENTER) {
        cell.classList.add('center');
      }
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.dataset.color = '';

      grid.appendChild(cell);
      cells.push(cell);
    }
  }
  updateCSS();
}

// Изменение размера через выпадающий список
gridSizeSelect.addEventListener('change', (e) => {
  initGrid(parseInt(e.target.value));
});

// Загрузка готовой картинки
uploadInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = SIZE;
      tempCanvas.height = SIZE;
      const tempCtx = tempCanvas.getContext('2d');

      tempCtx.clearRect(0, 0, SIZE, SIZE);
      tempCtx.drawImage(img, 0, 0, SIZE, SIZE);

      const imgData = tempCtx.getImageData(0, 0, SIZE, SIZE);
      const data = imgData.data;

      cells.forEach(cell => {
        cell.style.backgroundColor = '#ffffff';
        cell.dataset.color = '';
      });

      const importedColors = [];

      cells.forEach(cell => {
        const x = parseInt(cell.dataset.x);
        const y = parseInt(cell.dataset.y);
        const index = (y * SIZE + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const a = data[index + 3];

        if (a > 128) {
          const hexColor = rgbToHex(r, g, b);
          cell.style.backgroundColor = hexColor;
          cell.dataset.color = hexColor;
          importedColors.push(hexColor);
        }
      });

      // Добавляем уникальные цвета из загруженной картинки в историю (с конца, чтобы первые остались ближе к началу)
      [...new Set(importedColors.map(normalizeHex).filter(Boolean))]
        .reverse()
        .forEach(hex => addRecentColor(hex));

      updateCSS();
      uploadInput.value = '';
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

function rgbToHex(r, g, b) {
  const toHex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// События рисования (мышь, палец, стилус)
grid.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  isDrawing = true;
  const target = e.target.closest('.cell');
  if (target) {
    paintCell(target);
  }
});

grid.addEventListener('pointermove', (e) => {
  if (!isDrawing) return;
  const target = document.elementFromPoint(e.clientX, e.clientY);
  if (target && target.classList.contains('cell')) {
    paintCell(target);
  }
});

window.addEventListener('pointerup', () => { isDrawing = false; });
window.addEventListener('pointercancel', () => { isDrawing = false; });

// Функция покраски / стирания
function paintCell(cell) {
  if (mode === 'brush') {
    const color = colorPicker.value;
    cell.style.backgroundColor = color;
    cell.dataset.color = color;
    addRecentColor(color);
  } else {
    // Ластик
    cell.style.backgroundColor = '#ffffff';
    cell.dataset.color = '';
  }
  updateCSS();
}

colorPicker.addEventListener('input', renderRecentColors);
colorPicker.addEventListener('change', renderRecentColors);

// Генерация CSS с учетом центральной точки
function updateCSS() {
  const shadows = [];
  let centerColor = 'transparent';

  cells.forEach(cell => {
    const color = cell.dataset.color;
    if (color) {
      const x = parseInt(cell.dataset.x) - CENTER;
      const y = parseInt(cell.dataset.y) - CENTER;

      if (x === 0 && y === 0) {
        centerColor = color;
      } else {
        shadows.push(`${x}px ${y}px ${color}`);
      }
    }
  });

  previewPixel.style.backgroundColor = centerColor;
  previewPixel.style.boxShadow = shadows.length ? shadows.join(', ') : 'none';

  let cssCode = `.pixel-art {\n  width: 1px;\n  height: 1px;\n  background: ${centerColor};\n`;
  if (shadows.length > 0) {
    cssCode += `  box-shadow:\n    ${shadows.join(',\n    ')};\n`;
  }
  cssCode += `}`;

  cssOutput.value = (centerColor !== 'transparent' || shadows.length > 0)
    ? cssCode
    : '/* Нарисуй что-нибудь на сетке */';
}

// Переключение инструментов
brushBtn.addEventListener('click', () => {
  mode = 'brush';
  brushBtn.classList.add('active');
  eraserBtn.classList.remove('active');
});

eraserBtn.addEventListener('click', () => {
  mode = 'eraser';
  eraserBtn.classList.add('active');
  brushBtn.classList.remove('active');
});

// Кнопка очистки всего холста
clearBtn.addEventListener('click', () => {
  cells.forEach(cell => {
    cell.style.backgroundColor = '#ffffff';
    cell.dataset.color = '';
  });
  updateCSS();
});

// Кнопка копирования кода
copyBtn.addEventListener('click', () => {
  if (!cssOutput.value) return;
  cssOutput.select();
  navigator.clipboard.writeText(cssOutput.value);
  copyBtn.textContent = 'Скопировано!';
  setTimeout(() => copyBtn.textContent = 'Скопировать CSS', 1500);
});

// Первичный запуск сетки и панели недавних цветов
renderRecentColors();
initGrid(SIZE);