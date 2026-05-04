"use strict";

const ASSET_VERSION = "20260504b";

const DATA_SOURCES = {
  players: "data/players.json",
  teamColors: "data/team-colors.json",
  logoAliases: "data/logo-aliases.json"
};

const IMAGE_SOURCES = {
  background: "assets/background.png",
  overlay: "assets/White%20Lines.png"
};

const DEFAULT_COLORS = {
  accent: "#0062B8",
  shadow: "#0062B8"
};

const CANVAS_SIZE = {
  width: 1080,
  height: 1350
};

const LAYOUT = {
  cardRegion: { x: 586, y: 0, width: 494, height: 1350 },
  photoCutout: { x: 0, y: 0, width: 586, height: 1350 },
  logo: { centerX: 842, centerY: 185, maxWidth: 220, maxHeight: 126 },
  nameCenterX: 842,
  nameStartY: 300,
  nameLineGap: 88,
  blockCenterX: 842,
  stat: { valueY: 555, labelY: 620, maxWidth: 360 },
  weight: { valueY: 820, labelY: 885, maxWidth: 300 },
  height: { valueY: 1088, labelY: 1153, maxWidth: 260 },
  labelPaddingX: 24,
  labelHeight: 34
};

const refs = {
  form: document.getElementById("player-form"),
  search: document.getElementById("player-search"),
  datalist: document.getElementById("player-options"),
  weight: document.getElementById("player-weight"),
  height: document.getElementById("player-height"),
  reset: document.getElementById("reset-overrides"),
  download: document.getElementById("download-card"),
  status: document.getElementById("status"),
  canvas: document.getElementById("card-canvas")
};

const state = {
  players: [],
  playersByExactName: new Map(),
  teamColors: {},
  logoAliases: {},
  images: {},
  logoCache: new Map(),
  logoBoundsCache: new Map(),
  currentPlayer: null,
  currentLogo: null
};

async function init() {
  try {
    const [playersData, teamColorsData, logoAliases] = await Promise.all([
      fetchJson(DATA_SOURCES.players),
      fetchJson(DATA_SOURCES.teamColors),
      fetchJson(DATA_SOURCES.logoAliases)
    ]);

    await Promise.all([
      loadStaticImage("background", IMAGE_SOURCES.background),
      loadStaticImage("overlay", IMAGE_SOURCES.overlay),
      document.fonts.ready
    ]);

    await Promise.all([
      document.fonts.load('64px "Born Strong"'),
      document.fonts.load('36px "Winner"')
    ]);

    state.players = (playersData.players || []).slice().sort(sortPlayers);
    state.teamColors = teamColorsData.teams || {};
    state.logoAliases = logoAliases;
    indexPlayers(state.players);
    populatePlayerDatalist(state.players);
    bindEvents();

    if (state.players.length > 0) {
      selectPlayer(state.players[0]);
      refs.status.textContent = "Player data loaded. Search for a player to build a card.";
    } else {
      refs.status.textContent = "No players were found in data/players.json.";
    }
  } catch (error) {
    console.error(error);
    refs.status.textContent = "The app could not load its data or assets. Check the browser console for details.";
  }
}

function bindEvents() {
  refs.form.addEventListener("submit", handlePlayerSubmit);
  refs.search.addEventListener("change", tryLoadTypedPlayer);
  refs.weight.addEventListener("input", renderCard);
  refs.height.addEventListener("input", renderCard);
  refs.reset.addEventListener("click", resetOverrides);
  refs.download.addEventListener("click", downloadCard);
}

function sortPlayers(left, right) {
  const leftRank = Number.isFinite(left.rank) ? left.rank : Number.MAX_SAFE_INTEGER;
  const rightRank = Number.isFinite(right.rank) ? right.rank : Number.MAX_SAFE_INTEGER;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return left.name.localeCompare(right.name);
}

async function fetchJson(path) {
  const response = await fetch(withVersion(path), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}`);
  }
  return response.json();
}

async function loadStaticImage(key, source) {
  state.images[key] = await loadImage(source);
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${source}`));
    image.src = withVersion(source);
  });
}

function indexPlayers(players) {
  for (const player of players) {
    const normalized = normalizeText(player.name);
    if (!state.playersByExactName.has(normalized)) {
      state.playersByExactName.set(normalized, player);
    }
  }
}

function populatePlayerDatalist(players) {
  const fragment = document.createDocumentFragment();
  for (const player of players) {
    const option = document.createElement("option");
    option.value = player.name;
    option.label = `${player.team} | #${player.rank ?? "--"}`;
    fragment.appendChild(option);
  }
  refs.datalist.replaceChildren(fragment);
}

function handlePlayerSubmit(event) {
  event.preventDefault();
  loadPlayerFromQuery(refs.search.value);
}

function tryLoadTypedPlayer() {
  if (state.playersByExactName.has(normalizeText(refs.search.value))) {
    loadPlayerFromQuery(refs.search.value);
  }
}

function loadPlayerFromQuery(query) {
  const player = findPlayer(query);
  if (!player) {
    refs.status.textContent = `No player match was found for "${query}".`;
    return;
  }
  selectPlayer(player);
  refs.status.textContent = `Loaded ${player.name} from ${player.team}.`;
}

function findPlayer(query) {
  const normalized = normalizeText(query);
  if (!normalized) {
    return null;
  }

  const exact = state.playersByExactName.get(normalized);
  if (exact) {
    return exact;
  }

  return state.players.find((player) => normalizeText(player.name).includes(normalized)) || null;
}

function selectPlayer(player) {
  state.currentPlayer = player;
  state.currentLogo = null;
  refs.search.value = player.name;
  refs.weight.value = player.weightLbs ?? "";
  refs.height.value = formatHeightDisplay(player.heightInches);
  renderCard();
  void loadCurrentLogo(player.team);
}

function resetOverrides() {
  if (!state.currentPlayer) {
    return;
  }
  refs.weight.value = state.currentPlayer.weightLbs ?? "";
  refs.height.value = formatHeightDisplay(state.currentPlayer.heightInches);
  refs.status.textContent = `Reset height and weight back to the spreadsheet values for ${state.currentPlayer.name}.`;
  renderCard();
}

async function loadCurrentLogo(team) {
  const filename = state.logoAliases[team];
  if (!filename) {
    state.currentLogo = null;
    renderCard();
    return;
  }

  if (state.logoCache.has(filename)) {
    state.currentLogo = state.logoCache.get(filename);
    renderCard();
    return;
  }

  try {
    const image = await loadImage(`assets/logos/${encodeURIComponent(filename)}`);
    state.logoCache.set(filename, image);
    state.currentLogo = image;
  } catch (error) {
    console.error(error);
    state.logoCache.set(filename, null);
    state.currentLogo = null;
  }

  renderCard();
}

function renderCard() {
  const context = refs.canvas.getContext("2d");
  context.clearRect(0, 0, CANVAS_SIZE.width, CANVAS_SIZE.height);

  if (state.images.background) {
    drawRegion(context, state.images.background, LAYOUT.cardRegion);
  }

  if (state.images.overlay) {
    context.save();
    context.globalCompositeOperation = "screen";
    drawRegion(context, state.images.overlay, LAYOUT.cardRegion);
    context.restore();
  }

  clearPhotoCutout(context);

  if (!state.currentPlayer) {
    drawCenteredMessage(context, "LOAD A PLAYER");
    return;
  }

  const colors = pickTeamColors(state.teamColors[state.currentPlayer.team]);

  if (state.currentLogo) {
    drawLogo(context, state.currentLogo, LAYOUT.logo);
  } else {
    drawFallbackTeamText(context, state.currentPlayer.team, colors);
  }

  drawName(context, state.currentPlayer.name);
  drawStatBlock(context, buildStatLine(state.currentPlayer), "PTS / REB / AST", LAYOUT.stat, colors);
  drawStatBlock(context, buildWeightDisplay(), "WEIGHT", LAYOUT.weight, colors);
  drawStatBlock(context, buildHeightDisplay(), "HEIGHT", LAYOUT.height, colors);
}

function clearPhotoCutout(context) {
  const cutout = LAYOUT.photoCutout;
  context.clearRect(cutout.x, cutout.y, cutout.width, cutout.height);
}

function drawRegion(context, image, region) {
  context.drawImage(
    image,
    region.x,
    region.y,
    region.width,
    region.height,
    region.x,
    region.y,
    region.width,
    region.height
  );
}

function drawCenteredMessage(context, text) {
  context.save();
  context.textAlign = "center";
  context.fillStyle = "#ffffff";
  context.font = '82px "Born Strong"';
  context.fillText(text, 840, 700);
  context.restore();
}

function drawLogo(context, image, bounds) {
  context.save();
  const source = getOpaqueImageBounds(image);
  const scale = Math.min(bounds.maxWidth / source.width, bounds.maxHeight / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  const x = bounds.centerX - (width / 2);
  const y = bounds.centerY - (height / 2);
  context.drawImage(image, source.x, source.y, source.width, source.height, x, y, width, height);
  context.restore();
}

function getOpaqueImageBounds(image) {
  const cacheKey = image.currentSrc || image.src;
  if (state.logoBoundsCache.has(cacheKey)) {
    return state.logoBoundsCache.get(cacheKey);
  }

  const canvas = document.createElement("canvas");
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);

  const { data } = context.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[((y * width) + x) * 4 + 3];
      if (alpha === 0) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const bounds = maxX === -1
    ? { x: 0, y: 0, width, height }
    : {
        x: minX,
        y: minY,
        width: (maxX - minX) + 1,
        height: (maxY - minY) + 1
      };

  state.logoBoundsCache.set(cacheKey, bounds);
  return bounds;
}

function drawFallbackTeamText(context, team, colors) {
  drawStyledText(context, {
    text: team.toUpperCase(),
    x: LAYOUT.nameCenterX,
    y: 150,
    maxWidth: 260,
    baseSize: 40,
    minSize: 24,
    family: "Winner",
    fillStyle: "#ffffff",
    shadowColor: colors.shadow,
    letterSpacing: 2
  });
}

function drawName(context, name) {
  const lines = splitNameIntoLines(name);
  lines.forEach((line, index) => {
    drawStyledText(context, {
      text: line,
      x: LAYOUT.nameCenterX,
      y: LAYOUT.nameStartY + (index * LAYOUT.nameLineGap),
      maxWidth: 360,
      baseSize: lines.length > 2 ? 74 : 84,
      minSize: 44,
      family: "Born Strong",
      fillStyle: "#ffffff",
      shadowColor: "#121212",
      letterSpacing: 4
    });
  });
}

function drawStatBlock(context, value, label, block, colors) {
  drawStyledText(context, {
    text: value,
    x: blockCenterX(block),
    y: block.valueY,
    maxWidth: block.maxWidth,
    baseSize: label === "PTS / REB / AST" ? 72 : 94,
    minSize: 42,
    family: "Born Strong",
    fillStyle: "#ffffff",
    shadowColor: colors.shadow,
    letterSpacing: label === "PTS / REB / AST" ? 2 : 3,
    strokeStyle: "rgba(0, 0, 0, 0.45)",
    strokeWidth: 4
  });

  drawLabelBar(context, label, block.labelY, colors.accent);
}

function drawLabelBar(context, label, centerY, fillColor) {
  const fontSize = label === "PTS / REB / AST" ? 24 : 27;
  context.save();
  context.font = `${fontSize}px "Winner"`;
  const width = context.measureText(label).width + (LAYOUT.labelPaddingX * 2);
  const x = LAYOUT.blockCenterX - (width / 2);
  const y = centerY - (LAYOUT.labelHeight / 2);
  context.fillStyle = fillColor;
  context.fillRect(x, y, width, LAYOUT.labelHeight);
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, LAYOUT.blockCenterX, centerY + 1);
  context.restore();
}

function blockCenterX() {
  return LAYOUT.blockCenterX;
}

function drawStyledText(context, options) {
  const {
    text,
    x,
    y,
    maxWidth,
    baseSize,
    minSize,
    family,
    fillStyle,
    shadowColor,
    letterSpacing = 0,
    strokeStyle = null,
    strokeWidth = 0
  } = options;

  let size = baseSize;
  while (size > minSize) {
    context.font = `${size}px "${family}"`;
    if (measureSpacedText(context, text, letterSpacing) <= maxWidth) {
      break;
    }
    size -= 2;
  }

  context.save();
  context.font = `${size}px "${family}"`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = fillStyle;
  context.shadowColor = shadowColor;
  context.shadowOffsetX = 6;
  context.shadowOffsetY = 6;
  context.shadowBlur = 0;

  if (strokeStyle && strokeWidth > 0) {
    context.lineJoin = "round";
    context.lineWidth = strokeWidth;
    context.strokeStyle = strokeStyle;
    strokeSpacedText(context, text, x, y, letterSpacing);
  }

  fillSpacedText(context, text, x, y, letterSpacing);
  context.restore();
}

function measureSpacedText(context, text, letterSpacing) {
  if (!text) {
    return 0;
  }
  return context.measureText(text).width + (Math.max(text.length - 1, 0) * letterSpacing);
}

function fillSpacedText(context, text, centerX, centerY, letterSpacing) {
  context.textAlign = "left";
  const startX = centerX - (measureSpacedText(context, text, letterSpacing) / 2);
  let cursorX = startX;
  for (const character of text) {
    context.fillText(character, cursorX, centerY);
    cursorX += context.measureText(character).width + letterSpacing;
  }
}

function strokeSpacedText(context, text, centerX, centerY, letterSpacing) {
  context.textAlign = "left";
  const startX = centerX - (measureSpacedText(context, text, letterSpacing) / 2);
  let cursorX = startX;
  for (const character of text) {
    context.strokeText(character, cursorX, centerY);
    cursorX += context.measureText(character).width + letterSpacing;
  }
}

function splitNameIntoLines(name) {
  const tokens = name.toUpperCase().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) {
    return tokens;
  }

  const candidates = [];

  for (let index = 1; index < tokens.length; index += 1) {
    candidates.push([
      tokens.slice(0, index).join(" "),
      tokens.slice(index).join(" ")
    ]);
  }

  if (tokens.length >= 3) {
    for (let first = 1; first < tokens.length - 1; first += 1) {
      for (let second = first + 1; second < tokens.length; second += 1) {
        candidates.push([
          tokens.slice(0, first).join(" "),
          tokens.slice(first, second).join(" "),
          tokens.slice(second).join(" ")
        ]);
      }
    }
  }

  candidates.sort((left, right) => lineBalanceScore(left) - lineBalanceScore(right));
  return candidates[0];
}

function lineBalanceScore(lines) {
  const lengths = lines.map((line) => line.length);
  return (Math.max(...lengths) - Math.min(...lengths)) + Math.max(...lengths);
}

function buildStatLine(player) {
  const points = formatPerGame(player.perGame?.points);
  const rebounds = formatPerGame(player.perGame?.rebounds);
  const assists = formatPerGame(player.perGame?.assists);
  return `${points}/${rebounds}/${assists}`;
}

function buildWeightDisplay() {
  const value = refs.weight.value.trim();
  if (!value) {
    return "--LBS";
  }
  return `${value}LBS`;
}

function buildHeightDisplay() {
  const value = refs.height.value.trim();
  if (!value) {
    return "--";
  }

  if (/^\d+$/.test(value)) {
    return formatHeightDisplay(Number(value));
  }

  return value
    .replace(/[′’]/g, "'")
    .replace(/[″“”]/g, '"');
}

function formatPerGame(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--.-";
  }
  return value.toFixed(1);
}

function formatHeightDisplay(totalInches) {
  if (typeof totalInches !== "number" || Number.isNaN(totalInches)) {
    return "";
  }
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

function normalizeText(value) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function pickTeamColors(entry) {
  if (!entry) {
    return DEFAULT_COLORS;
  }

  return {
    accent: pickHighlightColor(entry),
    shadow: pickHighlightColor(entry)
  };
}

function pickHighlightColor(entry) {
  const candidates = [entry.secondary, entry.primary, entry.accent].filter(Boolean);

  for (const color of candidates) {
    const brightness = colorBrightness(color);
    if (brightness > 0.16 && brightness < 0.94) {
      return color;
    }
  }

  return candidates[0] || DEFAULT_COLORS.accent;
}

function withVersion(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${ASSET_VERSION}`;
}

function colorBrightness(hexColor) {
  const hex = hexColor.replace("#", "");
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255;
  return ((red * 299) + (green * 587) + (blue * 114)) / 1000;
}

function downloadCard() {
  if (!state.currentPlayer) {
    refs.status.textContent = "Load a player first before downloading.";
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = refs.canvas.toDataURL("image/png");
  anchor.download = `${slugify(state.currentPlayer.name)}-card.png`;
  anchor.click();
  refs.status.textContent = `Downloaded a PNG for ${state.currentPlayer.name}.`;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

void init();
