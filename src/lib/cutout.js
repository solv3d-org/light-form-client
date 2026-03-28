const cutoutCache = new Map();

export async function getCutoutSource(source) {
  if (!source || source.startsWith("data:image/png") || isRemoteSource(source)) return null;

  if (!cutoutCache.has(source)) {
    cutoutCache.set(source, createWhiteEdgeCutout(source));
  }

  return cutoutCache.get(source);
}

function createWhiteEdgeCutout(source) {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      try {
        resolve(buildCutoutFromWhiteEdges(image));
      } catch (error) {
        console.warn("Cutout processing failed for", source, error);
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function buildCutoutFromWhiteEdges(image) {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;

  const borderStats = measureWhiteEdgeConfidence(data, width, height);
  if (borderStats.ratio < 0.72) return null;

  const total = width * height;
  const visited = new Uint8Array(total);
  const background = new Uint8Array(total);
  const queue = new Uint32Array(total);
  let head = 0;
  let tail = 0;

  const push = (x, y) => {
    const index = y * width + x;
    if (visited[index]) return;
    if (!isBackgroundCandidate(data, index, true)) return;
    visited[index] = 1;
    background[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }

  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = (index - x) / width;

    for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny += 1) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx += 1) {
        const nextIndex = ny * width + nx;
        if (visited[nextIndex]) continue;
        if (!isBackgroundCandidate(data, nextIndex, false)) continue;
        visited[nextIndex] = 1;
        background[nextIndex] = 1;
        queue[tail++] = nextIndex;
      }
    }
  }

  const removedRatio = tail / total;
  if (removedRatio < 0.16) return null;

  for (let index = 0; index < total; index += 1) {
    const alphaIndex = index * 4 + 3;
    if (background[index]) {
      data[alphaIndex] = 0;
      continue;
    }

    if (!touchesBackground(background, width, height, index)) continue;

    const pixelIndex = index * 4;
    const red = data[pixelIndex];
    const green = data[pixelIndex + 1];
    const blue = data[pixelIndex + 2];
    const brightness = (red + green + blue) / 3;
    const spread = Math.max(red, green, blue) - Math.min(red, green, blue);

    if (brightness >= 240 && spread <= 28) {
      data[alphaIndex] = Math.min(data[alphaIndex], 84);
    } else if (brightness >= 230 && spread <= 40) {
      data[alphaIndex] = Math.min(data[alphaIndex], 156);
    }
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function measureWhiteEdgeConfidence(data, width, height) {
  let samples = 0;
  let white = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 80));

  for (let x = 0; x < width; x += step) {
    white += Number(isBackgroundCandidate(data, x, true));
    white += Number(isBackgroundCandidate(data, (height - 1) * width + x, true));
    samples += 2;
  }

  for (let y = 0; y < height; y += step) {
    white += Number(isBackgroundCandidate(data, y * width, true));
    white += Number(isBackgroundCandidate(data, y * width + (width - 1), true));
    samples += 2;
  }

  return { ratio: samples ? white / samples : 0 };
}

function isBackgroundCandidate(data, pixelIndex, strict) {
  const base = pixelIndex * 4;
  const alpha = data[base + 3];
  if (alpha === 0) return false;

  const red = data[base];
  const green = data[base + 1];
  const blue = data[base + 2];
  const brightness = (red + green + blue) / 3;
  const spread = Math.max(red, green, blue) - Math.min(red, green, blue);

  if (strict) {
    return brightness >= 244 && spread <= 18;
  }

  return brightness >= 236 && spread <= 28;
}

function touchesBackground(background, width, height, index) {
  const x = index % width;
  const y = (index - x) / width;

  for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny += 1) {
    for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx += 1) {
      if (nx === x && ny === y) continue;
      if (background[ny * width + nx]) return true;
    }
  }

  return false;
}

function isRemoteSource(source) {
  return /^https?:\/\//i.test(source);
}
