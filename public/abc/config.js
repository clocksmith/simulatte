// ============================================
// ABC - Configuration and State
// ============================================

// State (mutable, shared across modules)
export const state = {
  audioContext: null,
  isStarted: false,
  currentLetter: null,
  mouseX: 0,
  mouseY: 0,
  trailPoints: [],
  backgroundShapes: [],
  marqueeOffset: 0,
  // Speech recognition
  whisperWorker: null,
  isModelLoading: false,
  isModelLoaded: false,
  isListening: false,
  selectedModel: /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'tiny' : 'base',
  // Audio monitoring
  audioAnalyser: null,
  audioDataArray: null,
  micStream: null,
};

// Constants
export const MAX_SHAPES = 25;
export const MARQUEE_SPEED = 0.5;
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const shapeTypes = ['heart', 'star', 'triangle', 'circle', 'diamond'];

// Colors
export const colors = [
  '#ff6b6b', '#feca57', '#fff200', '#1dd1a1',
  '#48dbfb', '#5f27cd', '#a55eea', '#fd79a8',
  '#00d2d3', '#ff9ff3', '#54a0ff', '#5f27cd'
];

export const colorClasses = [
  'color-red', 'color-orange', 'color-yellow', 'color-green',
  'color-cyan', 'color-blue', 'color-purple', 'color-pink'
];

// ABC Song notes - frequencies and durations
export const abcSongNotes = {
  'a': { freq: 261.63, duration: 0.4 },
  'b': { freq: 261.63, duration: 0.4 },
  'c': { freq: 392.00, duration: 0.4 },
  'd': { freq: 392.00, duration: 0.4 },
  'e': { freq: 440.00, duration: 0.4 },
  'f': { freq: 440.00, duration: 0.4 },
  'g': { freq: 392.00, duration: 0.8 },
  'h': { freq: 349.23, duration: 0.4 },
  'i': { freq: 349.23, duration: 0.4 },
  'j': { freq: 329.63, duration: 0.4 },
  'k': { freq: 329.63, duration: 0.4 },
  'l': { freq: 293.66, duration: 0.22 },
  'm': { freq: 293.66, duration: 0.22 },
  'n': { freq: 293.66, duration: 0.22 },
  'o': { freq: 293.66, duration: 0.22 },
  'p': { freq: 261.63, duration: 0.5 },
  'q': { freq: 392.00, duration: 0.4 },
  'r': { freq: 392.00, duration: 0.4 },
  's': { freq: 349.23, duration: 0.5 },
  't': { freq: 329.63, duration: 0.4 },
  'u': { freq: 329.63, duration: 0.4 },
  'v': { freq: 293.66, duration: 0.5 },
  'w': {
    multi: true,
    notes: [
      { freq: 392.00, duration: 0.18 },
      { freq: 392.00, duration: 0.18 },
      { freq: 392.00, duration: 0.24 }
    ]
  },
  'x': { freq: 349.23, duration: 0.4 },
  'y': {
    multi: true,
    notes: [
      { freq: 329.63, duration: 0.25 },
      { freq: 329.63, duration: 0.25 }
    ]
  },
  'z': { freq: 293.66, duration: 0.8 },
  '0': { freq: 261.63, duration: 0.4 },
  '1': { freq: 293.66, duration: 0.4 },
  '2': { freq: 329.63, duration: 0.4 },
  '3': { freq: 349.23, duration: 0.4 },
  '4': { freq: 392.00, duration: 0.4 },
  '5': { freq: 440.00, duration: 0.4 },
  '6': { freq: 493.88, duration: 0.4 },
  '7': { freq: 523.25, duration: 0.4 },
  '8': { freq: 587.33, duration: 0.4 },
  '9': { freq: 659.25, duration: 0.4 }
};

// Letter name mappings for speech recognition
export const letterNames = {
  'a': ['a', 'ay', 'eh', 'ey', 'aa', 'hey', 'aye', 'eight', 'letter a'],
  'b': ['b', 'bee', 'bea', 'bi', 'be', 'baby', 'letter b'],
  'c': ['c', 'see', 'sea', 'si', 'cee', 'sie', 'xi', 'letter c'],
  'd': ['d', 'dee', 'di', 'de', 'the', 'letter d'],
  'e': ['e', 'ee', 'eee', 'ea', 'letter e'],
  'f': ['f', 'ef', 'eff', 'letter f'],
  'g': ['g', 'gee', 'ji', 'jee', 'ge', 'chee', 'letter g'],
  'h': ['h', 'aitch', 'eich', 'age', 'ach', 'each', 'letter h'],
  'i': ['i', 'eye', 'ai', 'letter i'],
  'j': ['j', 'jay', 'jae', 'je', 'jai', 'letter j'],
  'k': ['k', 'kay', 'kaye', 'ke', 'okay', 'letter k'],
  'l': ['l', 'el', 'ell', 'elle', 'al', 'ol', 'letter l'],
  'm': ['m', 'em', 'um', 'mm', 'letter m'],
  'n': ['n', 'en', 'an', 'letter n'],
  'o': ['o', 'oh', 'ow', 'owe', 'letter o'],
  'p': ['p', 'pee', 'pi', 'pea', 'pe', 'letter p'],
  'q': ['q', 'cue', 'queue', 'kyu', 'cu', 'qu', 'kew', 'letter q'],
  'r': ['r', 'ar', 'are', 'er', 'or', 'our', 'letter r'],
  's': ['s', 'es', 'ess', 'letter s'],
  't': ['t', 'tee', 'ti', 'tea', 'te', 'ty', 'letter t'],
  'u': ['u', 'you', 'yu', 'ooh', 'ew', 'uu', 'letter u'],
  'v': ['v', 'vee', 'vi', 've', 'letter v'],
  'w': ['w', 'double', 'double you', 'doubleyou', 'dub', 'duh', 'daba', 'dabliu', 'letter w'],
  'x': ['x', 'ex', 'eks', 'eggs', 'ax', 'ecks', 'letter x'],
  'y': ['y', 'wai', 'yeah', 'wie', 'wi', 'letter y'],
  'z': ['z', 'zee', 'ze', 'zi', 'letter z']
};

// Ambiguous sounds that could be multiple letters - resolved by sequential context
// Key: sound, Value: array of possible letters (in alphabet order)
export const ambiguousSounds = {
  // C vs Z (sibilant + ee sound) - After B→C, After Y→Z
  'zee': ['c', 'z'],
  'see': ['c', 'z'],
  'sea': ['c', 'z'],
  'si': ['c', 'z'],
  'zi': ['c', 'z'],
  'cee': ['c', 'z'],
  'ze': ['c', 'z'],
  // B vs P (plosive + ee) - After A→B, After O→P
  'bee': ['b', 'p'],
  'pee': ['b', 'p'],
  'be': ['b', 'p'],
  'pe': ['b', 'p'],
  // D vs T (dental + ee) - After C→D, After S→T
  'dee': ['d', 't'],
  'tee': ['d', 't'],
  'de': ['d', 't'],
  'te': ['d', 't'],
  // M vs N (nasal) - After L→M, After M→N
  'em': ['m', 'n'],
  'en': ['m', 'n'],
  'um': ['m', 'n'],
  'an': ['m', 'n'],
  // G vs J (similar start) - After F→G, After I→J
  'gee': ['g', 'j'],
  'jee': ['g', 'j'],
  'ji': ['g', 'j'],
  'ge': ['g', 'j'],
  'je': ['g', 'j'],
  // E vs I (short sounds) - After D→E, After H→I
  'ee': ['e', 'i'],
  'ea': ['e', 'i'],
  // K vs Q (similar sound) - After J→K, After P→Q
  'kay': ['k', 'q'],
  'cue': ['k', 'q'],
  'kew': ['k', 'q'],
  'que': ['k', 'q'],
  // B vs Y (sounds like "by/bye/why") - After A→B, After X→Y
  'by': ['b', 'y'],
  'bye': ['b', 'y'],
  'why': ['b', 'y'],
};

// Phonetic patterns for sequential letter detection
export const phoneticPatterns = {
  // A B C D E F G patterns
  'abc': ['a', 'b', 'c'],
  'abcd': ['a', 'b', 'c', 'd'],
  'abcde': ['a', 'b', 'c', 'd', 'e'],
  'abcdef': ['a', 'b', 'c', 'd', 'e', 'f'],
  'abcdefg': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  'bc': ['b', 'c'],
  'bcd': ['b', 'c', 'd'],
  'bcde': ['b', 'c', 'd', 'e'],
  'cd': ['c', 'd'],
  'cde': ['c', 'd', 'e'],
  'cdef': ['c', 'd', 'e', 'f'],
  'def': ['d', 'e', 'f'],
  'defg': ['d', 'e', 'f', 'g'],
  'efg': ['e', 'f', 'g'],
  'fg': ['f', 'g'],
  'fgh': ['f', 'g', 'h'],
  'gh': ['g', 'h'],
  'ghi': ['g', 'h', 'i'],
  // H I J K patterns
  'hij': ['h', 'i', 'j'],
  'hijk': ['h', 'i', 'j', 'k'],
  'ij': ['i', 'j'],
  'ijk': ['i', 'j', 'k'],
  'ijkl': ['i', 'j', 'k', 'l'],
  'jk': ['j', 'k'],
  'jkl': ['j', 'k', 'l'],
  'kl': ['k', 'l'],
  'klm': ['k', 'l', 'm'],
  // L M N O P patterns (famous fast part!)
  'lm': ['l', 'm'],
  'ellum': ['l', 'm'],
  'elm': ['l', 'm'],
  'lmn': ['l', 'm', 'n'],
  'element': ['l', 'm', 'n'],
  'elements': ['l', 'm', 'n'],
  'elementary': ['l', 'm', 'n'],
  'lmno': ['l', 'm', 'n', 'o'],
  'elemeno': ['l', 'm', 'n', 'o'],
  'elemental': ['l', 'm', 'n'],
  'lmnop': ['l', 'm', 'n', 'o', 'p'],
  'elemenop': ['l', 'm', 'n', 'o', 'p'],
  'elemenopy': ['l', 'm', 'n', 'o', 'p'],
  'elementy': ['l', 'm', 'n'],
  'mn': ['m', 'n'],
  'mno': ['m', 'n', 'o'],
  'mnop': ['m', 'n', 'o', 'p'],
  'nop': ['n', 'o', 'p'],
  'enop': ['n', 'o', 'p'],
  'enopy': ['n', 'o', 'p'],
  // O P Q R S patterns
  'op': ['o', 'p'],
  'opie': ['o', 'p'],
  'opi': ['o', 'p'],
  'opy': ['o', 'p'],
  'opq': ['o', 'p', 'q'],
  'pq': ['p', 'q'],
  'pqr': ['p', 'q', 'r'],
  'pqrs': ['p', 'q', 'r', 's'],
  'qr': ['q', 'r'],
  'qrs': ['q', 'r', 's'],
  'qrst': ['q', 'r', 's', 't'],
  'rs': ['r', 's'],
  'rst': ['r', 's', 't'],
  'rstu': ['r', 's', 't', 'u'],
  'st': ['s', 't'],
  'stu': ['s', 't', 'u'],
  'stuv': ['s', 't', 'u', 'v'],
  // T U V W patterns
  'tuv': ['t', 'u', 'v'],
  'tuvw': ['t', 'u', 'v', 'w'],
  'uv': ['u', 'v'],
  'uvw': ['u', 'v', 'w'],
  'uvwx': ['u', 'v', 'w', 'x'],
  'vw': ['v', 'w'],
  'vwx': ['v', 'w', 'x'],
  // W X Y Z patterns
  'wx': ['w', 'x'],
  'wxy': ['w', 'x', 'y'],
  'wxyz': ['w', 'x', 'y', 'z'],
  'xy': ['x', 'y'],
  'xyz': ['x', 'y', 'z'],
  'yz': ['y', 'z'],
};

// ABC Song tempo map
export const ABC_TEMPO = {
  normal: 500,
  fast: 220,
  held: 650,
  slow: 700,
  final: 800,
};

// Common words to filter out (not letter names)
export const commonWords = [
  // 2-letter words
  'he', 'we', 'me', 'no', 'so', 'go', 'do', 'to', 'of', 'or', 'an', 'as', 'at', 'if', 'in', 'is', 'it', 'my', 'on', 'up', 'us', 'am', 'hi', 'ok', 'im',
  // 3-letter words
  'and', 'for', 'are', 'but', 'not', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'let', 'may', 'new', 'now', 'old', 'two', 'way', 'who', 'boy', 'did', 'own', 'say', 'she', 'too', 'use', 'got', 'yes', 'yet', 'ago', 'age', 'ive', 'met', 'hay', 'pay', 'lay', 'ray', 'end', 'big', 'bad', 'red', 'set', 'run', 'man', 'men', 'try', 'huh', 'umm', 'hmm', 'car',
  // 4-letter words
  'have', 'been', 'call', 'come', 'each', 'find', 'from', 'give', 'good', 'here', 'just', 'know', 'like', 'look', 'make', 'more', 'much', 'over', 'part', 'some', 'such', 'take', 'than', 'that', 'them', 'then', 'they', 'this', 'time', 'very', 'want', 'well', 'were', 'what', 'when', 'will', 'with', 'word', 'work', 'yeah', 'your', 'said', 'went', 'back', 'also', 'into', 'only', 'most', 'next', 'keep', 'mean', 'does', 'done', 'need', 'feel', 'tell', 'last', 'made', 'home', 'love', 'elle', 'gene', 'left', 'ever', 'even', 'hear', 'help', 'told',
  // 5+ letter words
  'hello', 'being', 'their', 'about', 'would', 'could', 'there', 'where', 'which', 'these', 'those', 'other', 'after', 'think', 'first', 'going', 'thing', 'right', 'still', 'again', 'never', 'under', 'night', 'great', 'every', 'years', 'maybe', 'meant', 'thank', 'thanks', 'change', 'double', 'effect', 'effects', 'really', 'people', 'before', 'should', 'saying', 'things', 'little', 'always', 'wanted', 'enough', 'pretty'
];

// DOM Elements (will be set on init)
export const elements = {
  app: null,
  letterDisplay: null,
  particlesContainer: null,
  startScreen: null,
  trailCanvas: null,
  ctx: null,
  celebrationOverlay: null,
  micIndicator: null,
  modelLoader: null,
};

// Initialize DOM elements
export function initElements() {
  elements.app = document.getElementById('app');
  elements.letterDisplay = document.getElementById('letter-display');
  elements.particlesContainer = document.getElementById('particles');
  elements.startScreen = document.getElementById('start-screen');
  elements.trailCanvas = document.getElementById('trail-canvas');
  elements.ctx = elements.trailCanvas.getContext('2d');
  elements.celebrationOverlay = document.getElementById('celebration-overlay');
  elements.micIndicator = document.getElementById('mic-indicator');
  elements.modelLoader = document.getElementById('model-loader');
}
