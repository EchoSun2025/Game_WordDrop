const fs = require('fs');
const path = require('path');

const SOURCE_BACKUP = process.env.WORDDROP_SOURCE_BACKUP || 'D:/0_EnglishLearning/backups/userdata-latest.json';
const SOURCE_IMAGES_DIR = process.env.WORDDROP_SOURCE_IMAGES || 'D:/0_EnglishLearning/images';
const TARGET_MONTH = process.env.WORDDROP_TARGET_MONTH || '2026-04';
const OUTPUT_DIR = path.resolve(__dirname, '..', 'data');
const OUTPUT_IMAGES_DIR = path.join(OUTPUT_DIR, 'lexiland-april-2026-images');
const OUTPUT_JSON_PATH = path.join(OUTPUT_DIR, 'lexiland-april-2026-image-words.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

function pickImagePath(annotation) {
  const imagePaths = toArray(annotation.emojiImagePath).filter(Boolean);
  if (imagePaths.length === 0) return '';
  return imagePaths[imagePaths.length - 1];
}

function buildWordRecord(annotation) {
  const imagePath = pickImagePath(annotation);
  const fileName = imagePath.split('/').pop();
  if (!fileName) return null;

  const sourceFilePath = path.join(SOURCE_IMAGES_DIR, fileName);
  if (!fs.existsSync(sourceFilePath)) return null;

  const targetFilePath = path.join(OUTPUT_IMAGES_DIR, fileName);
  fs.copyFileSync(sourceFilePath, targetFilePath);

  return {
    id: annotation.activeMeaningId || `${annotation.word}-${annotation.cachedAt}`,
    word: annotation.word,
    baseForm: annotation.baseForm || annotation.word,
    zh: annotation.chinese || '',
    pos: annotation.partOfSpeech || 'unknown',
    definition: annotation.definition || '',
    example: annotation.example || '',
    context: annotation.sentenceContext || annotation.sentence || '',
    sentenceTranslation: '',
    image: `./data/lexiland-april-2026-images/${fileName}`,
    images: [`./data/lexiland-april-2026-images/${fileName}`],
    wordForms: Array.isArray(annotation.wordForms) ? annotation.wordForms : [],
    sourceCachedAt: annotation.cachedAt,
    sourceDocumentTitle: annotation.documentTitle || '',
    sourceImagePath: imagePath,
    sourceImageModel: annotation.emojiModel || '',
  };
}

function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(OUTPUT_IMAGES_DIR);

  const backup = readJson(SOURCE_BACKUP);
  const annotations = backup?.data?.annotations || [];

  const filtered = annotations
    .filter((annotation) => String(annotation.cachedAt || '').startsWith(TARGET_MONTH))
    .filter((annotation) => pickImagePath(annotation))
    .filter((annotation) => annotation.word && (annotation.sentenceContext || annotation.example || annotation.definition));

  const words = filtered
    .sort((left, right) => String(left.cachedAt).localeCompare(String(right.cachedAt)))
    .map(buildWordRecord)
    .filter(Boolean);

  const payload = {
    name: 'LexiLand April 2026 Image Words',
    generatedAt: new Date().toISOString(),
    sourceBackup: SOURCE_BACKUP,
    sourceImagesDir: SOURCE_IMAGES_DIR,
    targetMonth: TARGET_MONTH,
    totalWords: words.length,
    words,
  };

  fs.writeFileSync(OUTPUT_JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    outputJson: OUTPUT_JSON_PATH,
    outputImagesDir: OUTPUT_IMAGES_DIR,
    totalWords: words.length,
  }, null, 2));
}

main();
