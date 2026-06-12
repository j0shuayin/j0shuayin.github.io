const DIRECTIONS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
];

const MIN_WORD_LENGTH = 3;
const FREQUENCY_BALANCE_EXPONENT = 0.72;
const VOWEL_INDICES = new Set([0, 4, 8, 14, 20]); // A, E, I, O, U
const VOWEL_WEIGHT_FACTOR = 0.75;
export const SEED_SCORE_THRESHOLD = 200_000;
const MAX_GENERATION_ATTEMPTS = 200;
const PATH_GENERATION_ATTEMPTS = 80;

export const MIN_SCORE_SLIDER_MIN = 50_000;
export const MIN_SCORE_SLIDER_MAX = 500_000;
export const MIN_SCORE_SLIDER_STEP = 5_000;
export const MIN_SCORE_SLIDER_DEFAULT = 200_000;

export function wordScore(word) {
    const n = word.length;
    if (n < MIN_WORD_LENGTH) return 0;
    if (n === 3) return 100;
    if (n === 4) return 400;
    if (n === 5) return 800;
    if (n === 6) return 1400;
    if (n === 7) return 1800;
    if (n === 8) return 2200;
    return 2600 + (n - 9) * 400;
}

function createTrieNode() {
    return { children: {}, isWord: false, word: null };
}

const MAX_SEED_WORD_LENGTH = 12;

export function parseSeedWordsText(text) {
    return text
        .split('\n')
        .map((line) => line.trim().toUpperCase())
        .filter((word) => word.length >= 8 && word.length <= MAX_SEED_WORD_LENGTH);
}

export function buildSeedWordsByTier(seed60Text, seed70Text, seed80Text) {
    return {
        tier60: parseSeedWordsText(seed60Text),
        tier70: parseSeedWordsText(seed70Text),
        tier80: parseSeedWordsText(seed80Text),
    };
}

export function getSeedWordsForScore(minScore, seedWordsByTier) {
    if (minScore >= 400_000) return seedWordsByTier.tier80;
    if (minScore >= 300_000) return seedWordsByTier.tier70;
    if (minScore >= SEED_SCORE_THRESHOLD) return seedWordsByTier.tier60;
    return [];
}

export function balanceFrequencies(frequencies) {
    return frequencies.map((f, i) => {
        let weight = Math.pow(f + 1, FREQUENCY_BALANCE_EXPONENT);
        if (VOWEL_INDICES.has(i)) weight *= VOWEL_WEIGHT_FACTOR;
        return weight;
    });
}

export function buildTrieAndFrequencies(text) {
    const root = createTrieNode();
    const frequencies = new Array(26).fill(0);
    const lines = text.split('\n');

    for (const line of lines) {
        const word = line.trim().toUpperCase();
        if (word.length < MIN_WORD_LENGTH) continue;

        for (const ch of word) {
            const idx = ch.charCodeAt(0) - 65;
            if (idx >= 0 && idx < 26) frequencies[idx]++;
        }

        let node = root;
        for (const ch of word) {
            if (!node.children[ch]) node.children[ch] = createTrieNode();
            node = node.children[ch];
        }
        node.isWord = true;
        node.word = word;
    }

    return { trie: root, frequencies: balanceFrequencies(frequencies) };
}

function cellKey(row, col) {
    return `${row},${col}`;
}

function pickWeightedLetter(weights) {
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < 26; i++) {
        roll -= weights[i];
        if (roll <= 0) return String.fromCharCode(65 + i);
    }
    return 'E';
}

function generateRandomPath(size, length) {
    for (let attempt = 0; attempt < PATH_GENERATION_ATTEMPTS; attempt++) {
        const startR = Math.floor(Math.random() * size);
        const startC = Math.floor(Math.random() * size);
        const path = [[startR, startC]];
        const visited = new Set([cellKey(startR, startC)]);

        while (path.length < length) {
            const [r, c] = path[path.length - 1];
            const neighbors = [];

            for (const [dr, dc] of DIRECTIONS) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
                const key = cellKey(nr, nc);
                if (!visited.has(key)) neighbors.push([nr, nc]);
            }

            if (neighbors.length === 0) break;

            const [nr, nc] = neighbors[Math.floor(Math.random() * neighbors.length)];
            path.push([nr, nc]);
            visited.add(cellKey(nr, nc));
        }

        if (path.length === length) return path;
    }

    return null;
}

function hasChainableSameLetterTriple(board) {
    const size = board.length;

    function dfs(r, c, letter, depth, visited) {
        if (depth >= 3) return true;

        visited.add(cellKey(r, c));
        for (const [dr, dc] of DIRECTIONS) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
            if (visited.has(cellKey(nr, nc))) continue;
            if (board[nr][nc] !== letter) continue;
            if (dfs(nr, nc, letter, depth + 1, visited)) return true;
        }
        visited.delete(cellKey(r, c));
        return false;
    }

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (dfs(r, c, board[r][c], 1, new Set())) return true;
        }
    }

    return false;
}

export function generateBoard(size, weights) {
    const board = [];
    for (let r = 0; r < size; r++) {
        const row = [];
        for (let c = 0; c < size; c++) {
            row.push(pickWeightedLetter(weights));
        }
        board.push(row);
    }
    return board;
}

function generateSeededBoard(size, weights, seedWords) {
    if (seedWords.length === 0) {
        return { board: generateBoard(size, weights), seedWord: null };
    }

    const maxCells = size * size;

    for (let attempt = 0; attempt < 25; attempt++) {
        const seedWord = seedWords[Math.floor(Math.random() * seedWords.length)];
        if (seedWord.length > maxCells) continue;

        const path = generateRandomPath(size, seedWord.length);
        if (!path) continue;

        const board = Array.from({ length: size }, () => Array(size).fill(null));
        for (let i = 0; i < path.length; i++) {
            const [r, c] = path[i];
            board[r][c] = seedWord[i];
        }

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === null) {
                    board[r][c] = pickWeightedLetter(weights);
                }
            }
        }

        if (!hasChainableSameLetterTriple(board)) {
            return { board, seedWord };
        }
    }

    return { board: generateBoard(size, weights), seedWord: null };
}

function dfsSolve(board, row, col, trieNode, visited, found) {
    const letter = board[row][col];
    const next = trieNode.children[letter];
    if (!next) return;

    if (next.isWord) found.add(next.word);

    visited.add(cellKey(row, col));
    const size = board.length;

    for (const [dr, dc] of DIRECTIONS) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const key = cellKey(nr, nc);
        if (visited.has(key)) continue;
        dfsSolve(board, nr, nc, next, visited, found);
    }

    visited.delete(cellKey(row, col));
}

export function solveBoard(board, trie) {
    const found = new Set();
    const size = board.length;

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const letter = board[r][c];
            if (!trie.children[letter]) continue;
            dfsSolve(board, r, c, trie, new Set(), found);
        }
    }

    const words = [...found];
    const totalScore = words.reduce((sum, w) => sum + wordScore(w), 0);
    return { words, totalScore, wordCount: words.length };
}

function dfsFindPath(board, row, col, word, index, visited) {
    if (board[row][col] !== word[index]) return null;
    if (index === word.length - 1) return [[row, col]];

    visited.add(cellKey(row, col));
    const size = board.length;

    for (const [dr, dc] of DIRECTIONS) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (visited.has(cellKey(nr, nc))) continue;

        const tail = dfsFindPath(board, nr, nc, word, index + 1, visited);
        if (tail) {
            visited.delete(cellKey(row, col));
            return [[row, col], ...tail];
        }
    }

    visited.delete(cellKey(row, col));
    return null;
}

export function findWordPath(board, word) {
    const size = board.length;
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const path = dfsFindPath(board, r, c, word, 0, new Set());
            if (path) return path;
        }
    }
    return null;
}

function dfsFindAllPaths(board, row, col, word, index, visited, path, results) {
    if (board[row][col] !== word[index]) return;

    const newPath = [...path, [row, col]];
    if (index === word.length - 1) {
        results.push(newPath);
        return;
    }

    visited.add(cellKey(row, col));
    const size = board.length;

    for (const [dr, dc] of DIRECTIONS) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (visited.has(cellKey(nr, nc))) continue;
        dfsFindAllPaths(board, nr, nc, word, index + 1, visited, newPath, results);
    }

    visited.delete(cellKey(row, col));
}

export function findAllSuffixPaths(board, suffix) {
    const upper = suffix.toUpperCase();
    const size = board.length;
    const results = [];

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            dfsFindAllPaths(board, r, c, upper, 0, new Set(), [], results);
        }
    }

    const seen = new Set();
    return results.filter((path) => {
        const key = path.map(([pr, pc]) => cellKey(pr, pc)).join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function isWordInTrie(trie, word) {
    let node = trie;
    for (const ch of word) {
        if (!node.children[ch]) return false;
        node = node.children[ch];
    }
    return node.isWord;
}

export function sortWordsByLength(words) {
    return [...words].sort((a, b) => {
        if (b.length !== a.length) return b.length - a.length;
        return a.localeCompare(b);
    });
}

function generateCandidateBoard(size, weights, minScore, seedWordsByTier) {
    const seedPool = getSeedWordsForScore(minScore, seedWordsByTier);
    const useSeed = minScore >= SEED_SCORE_THRESHOLD && seedPool.length > 0;
    return useSeed
        ? generateSeededBoard(size, weights, seedPool)
        : { board: generateBoard(size, weights), seedWord: null };
}

export function generatePlayableBoard(size, weights, trie, minScore, seedWordsByTier) {
    let best = null;

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
        const { board, seedWord } = generateCandidateBoard(size, weights, minScore, seedWordsByTier);
        if (hasChainableSameLetterTriple(board)) continue;

        const result = solveBoard(board, trie);
        const candidate = { board, seedWord, ...result };
        if (result.totalScore >= minScore) {
            return candidate;
        }
        if (!best || result.totalScore > best.totalScore) {
            best = candidate;
        }
    }

    return best;
}

export const SUFFIX_OPTIONS = [
    'es', 'ed', 'ies', 'ng', 'ngs', 'ing', 'er', 'ier', 'est', 'ers',
];

const MAX_SUFFIX_GENERATION_ATTEMPTS = 200;

function minSuffixWordCount(suffix) {
    return suffix.length === 2 ? 10 : 6;
}

export function wordsEndingWithSuffix(words, suffix) {
    const upper = suffix.toUpperCase();
    return words.filter((word) => word.endsWith(upper));
}

function generateSuffixBoard(size, weights, suffix) {
    const upper = suffix.toUpperCase();
    const path = generateRandomPath(size, upper.length);
    if (!path) return null;

    const board = Array.from({ length: size }, () => Array(size).fill(null));
    for (let i = 0; i < path.length; i++) {
        const [r, c] = path[i];
        board[r][c] = upper[i];
    }

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (board[r][c] === null) {
                board[r][c] = pickWeightedLetter(weights);
            }
        }
    }

    return { board, suffixPath: path };
}

export function generateSuffixPlayableBoard(size, weights, trie, suffix) {
    const minCount = minSuffixWordCount(suffix);
    let best = null;

    for (let attempt = 0; attempt < MAX_SUFFIX_GENERATION_ATTEMPTS; attempt++) {
        const generated = generateSuffixBoard(size, weights, suffix);
        if (!generated) continue;

        const { board, suffixPath } = generated;
        if (hasChainableSameLetterTriple(board)) continue;

        const result = solveBoard(board, trie);
        const suffixWords = wordsEndingWithSuffix(result.words, suffix);
        const suffixScore = suffixWords.reduce((sum, w) => sum + wordScore(w), 0);
        const candidate = {
            board,
            suffixPath,
            suffix: suffix.toUpperCase(),
            suffixWords,
            suffixScore,
            seedWord: null,
            ...result,
        };

        if (suffixWords.length >= minCount) {
            return candidate;
        }
        if (!best || suffixWords.length > best.suffixWords.length) {
            best = candidate;
        }
    }

    return best;
}
