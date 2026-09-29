const DIRECTIONS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
];

const MIN_WORD_LENGTH = 3;
export const COMMON_LETTERS = new Set('ETAOGINSRHDLUCMF'.split(''));
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
const MIN_SEED_WORD_LENGTH = 8;

export function commonLetterRatio(word) {
    let commonCount = 0;
    for (const ch of word) {
        if (COMMON_LETTERS.has(ch)) commonCount++;
    }
    return commonCount / word.length;
}

export function hasAtMostTwoOfAnyLetter(word) {
    return hasAtMostNOfAnyLetter(word, 2);
}

export function isValidSeedWord(word) {
    return (
        word.length >= MIN_SEED_WORD_LENGTH &&
        word.length <= MAX_SEED_WORD_LENGTH &&
        hasAtMostTwoOfAnyLetter(word)
    );
}

export function parseSeedWordsText(text) {
    return text
        .split('\n')
        .map((line) => line.trim().toUpperCase())
        .filter((word) => isValidSeedWord(word));
}

export function getSeedWordsForScore(minScore, seedWords) {
    if (minScore >= SEED_SCORE_THRESHOLD && seedWords.length > 0) {
        return seedWords;
    }
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
    const wordSet = new Set();
    const anagramMap = new Map();
    const lines = text.split('\n');

    for (const line of lines) {
        const word = line.trim().toUpperCase();
        if (word.length < MIN_WORD_LENGTH) continue;
        if (!hasAtMostNOfAnyLetter(word, MAX_SAME_LETTER_IN_WORDLIST)) continue;

        wordSet.add(word);
        const signature = [...word].sort().join('');
        if (!anagramMap.has(signature)) anagramMap.set(signature, []);
        anagramMap.get(signature).push(word);

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

    return {
        trie: root,
        frequencies: balanceFrequencies(frequencies),
        wordSet,
        anagramMap,
    };
}

function cellKey(row, col) {
    return `${row},${col}`;
}

const MAX_LETTER_OCCURRENCES_ON_BOARD = 2;
const MAX_SAME_LETTER_IN_WORDLIST = 3;

export function hasAtMostNOfAnyLetter(word, maxCount) {
    const counts = {};
    for (const ch of word) {
        counts[ch] = (counts[ch] || 0) + 1;
        if (counts[ch] > maxCount) return false;
    }
    return true;
}

function pickWeightedLetter(weights, letterCounts = null) {
    let total = 0;
    for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(65 + i);
        if (letterCounts && (letterCounts[letter] || 0) >= MAX_LETTER_OCCURRENCES_ON_BOARD) {
            continue;
        }
        total += weights[i];
    }
    if (total <= 0) return null;

    let roll = Math.random() * total;
    for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(65 + i);
        if (letterCounts && (letterCounts[letter] || 0) >= MAX_LETTER_OCCURRENCES_ON_BOARD) {
            continue;
        }
        roll -= weights[i];
        if (roll <= 0) return letter;
    }
    return null;
}

function countBoardLetters(board) {
    const counts = {};
    for (const row of board) {
        for (const letter of row) {
            if (!letter) continue;
            counts[letter] = (counts[letter] || 0) + 1;
        }
    }
    return counts;
}

function hasMoreThanTwoOfAnyLetterOnBoard(board) {
    const counts = countBoardLetters(board);
    return Object.values(counts).some((count) => count > MAX_LETTER_OCCURRENCES_ON_BOARD);
}

function fillEmptyCells(board, weights) {
    const counts = countBoardLetters(board);
    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[r].length; c++) {
            if (board[r][c] !== null) continue;
            const letter = pickWeightedLetter(weights, counts);
            if (!letter) return false;
            board[r][c] = letter;
            counts[letter] = (counts[letter] || 0) + 1;
        }
    }
    return true;
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
    const board = Array.from({ length: size }, () => Array(size).fill(null));
    if (!fillEmptyCells(board, weights)) return null;
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
        if (!hasAtMostTwoOfAnyLetter(seedWord)) continue;

        const path = generateRandomPath(size, seedWord.length);
        if (!path) continue;

        const board = Array.from({ length: size }, () => Array(size).fill(null));
        for (let i = 0; i < path.length; i++) {
            const [r, c] = path[i];
            board[r][c] = seedWord[i];
        }

        if (!fillEmptyCells(board, weights)) continue;
        if (hasMoreThanTwoOfAnyLetterOnBoard(board)) continue;
        if (hasChainableSameLetterTriple(board)) continue;

        return { board, seedWord };
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

function generateCandidateBoard(size, weights, minScore, seedWords) {
    const seedPool = getSeedWordsForScore(minScore, seedWords);
    const useSeed = seedPool.length > 0;
    return useSeed
        ? generateSeededBoard(size, weights, seedPool)
        : { board: generateBoard(size, weights), seedWord: null };
}

export function generatePlayableBoard(size, weights, trie, minScore, seedWords) {
    let best = null;

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
        const candidateBoard = generateCandidateBoard(size, weights, minScore, seedWords);
        if (!candidateBoard?.board) continue;
        const { board, seedWord } = candidateBoard;
        if (hasMoreThanTwoOfAnyLetterOnBoard(board)) continue;
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

const MAX_SUFFIX_GENERATION_ATTEMPTS = 100;

function minSuffixWordCount(suffix) {
    return suffix.length === 2 ? 10 : 6;
}

export function wordsEndingWithSuffix(words, suffix) {
    const upper = suffix.toUpperCase();
    return words.filter((word) => word.endsWith(upper));
}

function generateSuffixBoard(size, weights, suffix) {
    const upper = suffix.toUpperCase();
    if (!hasAtMostTwoOfAnyLetter(upper)) return null;

    const path = generateRandomPath(size, upper.length);
    if (!path) return null;

    const board = Array.from({ length: size }, () => Array(size).fill(null));
    for (let i = 0; i < path.length; i++) {
        const [r, c] = path[i];
        board[r][c] = upper[i];
    }

    if (!fillEmptyCells(board, weights)) return null;
    return { board, suffixPath: path };
}

function generateRandomAdjacentPair(size) {
    for (let attempt = 0; attempt < PATH_GENERATION_ATTEMPTS; attempt++) {
        const r = Math.floor(Math.random() * size);
        const c = Math.floor(Math.random() * size);
        const neighbors = [];

        for (const [dr, dc] of DIRECTIONS) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
                neighbors.push([nr, nc]);
            }
        }

        if (neighbors.length === 0) continue;

        const [nr, nc] = neighbors[Math.floor(Math.random() * neighbors.length)];
        return [[r, c], [nr, nc]];
    }

    return null;
}

function normalizePathKey(path) {
    return path
        .map(([r, c]) => cellKey(r, c))
        .sort()
        .join('|');
}

export function findAllDoublePairPaths(board, doublePair) {
    const letter = doublePair[0].toUpperCase();
    const size = board.length;
    const results = [];
    const seen = new Set();

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (board[r][c] !== letter) continue;

            for (const [dr, dc] of DIRECTIONS) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
                if (board[nr][nc] !== letter) continue;

                const path = [[r, c], [nr, nc]];
                const key = normalizePathKey(path);
                if (seen.has(key)) continue;
                seen.add(key);
                results.push(path);
            }
        }
    }

    return results;
}

export const DOUBLE_PAIR_OPTIONS = [
    'tt', 'nn', 'rr', 'ss', 'll', 'dd', 'ee', 'oo',
];

const MAX_DOUBLE_GENERATION_ATTEMPTS = 100;
const MIN_DOUBLE_WORD_COUNT = 6;
const MIN_TRAINER_WORD_LENGTH = 4;

export function wordsContainingDoublePair(words, doublePair) {
    const upper = doublePair.toUpperCase();
    return words.filter(
        (word) => word.length >= MIN_TRAINER_WORD_LENGTH && word.includes(upper)
    );
}

export function getSuffixExtensionWords(allBoardWords, suffix) {
    const upper = suffix.toUpperCase();
    const boardWordSet = new Set(allBoardWords);
    const extensions = [];

    for (const extended of allBoardWords) {
        if (extended.endsWith(upper)) continue;
        if (extended.length < upper.length + 2) continue;

        const stem = extended.slice(0, -1);
        if (stem.length < MIN_WORD_LENGTH) continue;
        if (!stem.endsWith(upper)) continue;
        if (!boardWordSet.has(stem)) continue;

        extensions.push(extended);
    }

    return extensions;
}

function generateDoubleBoard(size, weights, doublePair) {
    const letter = doublePair[0].toUpperCase();
    const pair = generateRandomAdjacentPair(size);
    if (!pair) return null;

    const board = Array.from({ length: size }, () => Array(size).fill(null));
    for (const [r, c] of pair) {
        board[r][c] = letter;
    }

    if (!fillEmptyCells(board, weights)) return null;
    return { board, doublePairPath: pair };
}

export function generateDoublePlayableBoard(size, weights, trie, doublePair) {
    let best = null;

    for (let attempt = 0; attempt < MAX_DOUBLE_GENERATION_ATTEMPTS; attempt++) {
        const generated = generateDoubleBoard(size, weights, doublePair);
        if (!generated) continue;

        const { board, doublePairPath } = generated;
        if (hasMoreThanTwoOfAnyLetterOnBoard(board)) continue;
        if (hasChainableSameLetterTriple(board)) continue;

        const result = solveBoard(board, trie);
        const doubleWords = wordsContainingDoublePair(result.words, doublePair);
        const doubleScore = doubleWords.reduce((sum, w) => sum + wordScore(w), 0);
        const candidate = {
            board,
            doublePairPath,
            doublePair: doublePair.toUpperCase(),
            doubleWords,
            doubleScore,
            seedWord: null,
            ...result,
        };

        if (doubleWords.length >= MIN_DOUBLE_WORD_COUNT) {
            return candidate;
        }
        if (!best || doubleWords.length > best.doubleWords.length) {
            best = candidate;
        }
    }

    return best;
}

export function generateSuffixPlayableBoard(size, weights, trie, suffix) {
    const minCount = minSuffixWordCount(suffix);
    let best = null;

    for (let attempt = 0; attempt < MAX_SUFFIX_GENERATION_ATTEMPTS; attempt++) {
        const generated = generateSuffixBoard(size, weights, suffix);
        if (!generated) continue;

        const { board, suffixPath } = generated;
        if (hasMoreThanTwoOfAnyLetterOnBoard(board)) continue;
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

const MIN_TARGET_WORD_LENGTH = 4;
const MAX_TARGET_GENERATION_ATTEMPTS = 200;
const MIN_TARGET_WORDS_ON_BOARD = 3;
const TARGET_RECOMMENDATION_LIMIT = 100;
const REVERSE_SCORE = 100;
const ANAGRAM_SCORE = 80;
const INSERTION_SCORE = 50;
const REPLACEMENT_SCORE = 60;
const PLURAL_S_SCORE = 70;
const ACCEPTS_S_BONUS = 25;

const ALL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function normalizeToken(token) {
    return token.trim().toUpperCase().replace(/[^A-Z]/g, '');
}

function canPlaceWordWithCounts(word, letterCounts) {
    const provisional = { ...letterCounts };
    for (const ch of word) {
        provisional[ch] = (provisional[ch] || 0) + 1;
        if (provisional[ch] > MAX_LETTER_OCCURRENCES_ON_BOARD) return false;
    }
    return true;
}

function generatePathOnEmptyCells(board, length, letterCounts, word) {
    const size = board.length;
    if (!canPlaceWordWithCounts(word, letterCounts)) return null;

    for (let attempt = 0; attempt < PATH_GENERATION_ATTEMPTS; attempt++) {
        const emptyCells = [];
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] === null) emptyCells.push([r, c]);
            }
        }
        if (emptyCells.length < length) return null;

        const [startR, startC] = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        const path = [[startR, startC]];
        const visited = new Set([cellKey(startR, startC)]);

        while (path.length < length) {
            const [r, c] = path[path.length - 1];
            const neighbors = [];
            for (const [dr, dc] of DIRECTIONS) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
                if (board[nr][nc] !== null) continue;
                const key = cellKey(nr, nc);
                if (visited.has(key)) continue;
                neighbors.push([nr, nc]);
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

function placeWordOnBoard(board, word, path) {
    for (let i = 0; i < path.length; i++) {
        const [r, c] = path[i];
        board[r][c] = word[i];
    }
}

/**
 * Parse a pasted target list.
 * Supports newline-separated entries, slash alternatives (a/b/c),
 * and reversal pairs (ante -> etna).
 */
export function parseTargetWordListText(text) {
    const words = new Set();
    const skipped = [];

    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;

        const arrowMatch = line.match(/^(.+?)\s*->\s*(.+)$/);
        const chunks = arrowMatch
            ? [...arrowMatch[1].split('/'), ...arrowMatch[2].split('/')]
            : line.split('/');

        for (const chunk of chunks) {
            const word = normalizeToken(chunk);
            if (!word) continue;
            if (word.length < MIN_TARGET_WORD_LENGTH) {
                skipped.push(word || chunk.trim());
                continue;
            }
            if (!hasAtMostTwoOfAnyLetter(word)) {
                skipped.push(word);
                continue;
            }
            words.add(word);
        }
    }

    return {
        words: [...words].sort((a, b) => a.localeCompare(b)),
        skipped: [...new Set(skipped)],
    };
}

export function formatTargetWordListForExport(words) {
    return words
        .map((w) => w.toLowerCase())
        .sort((a, b) => a.localeCompare(b))
        .join('\n');
}

export function getRecommendedTargetWords(userWords, wordSet, anagramMap, limit = TARGET_RECOMMENDATION_LIMIT) {
    const userSet = new Set(userWords.map((w) => w.toUpperCase()));
    const scores = new Map();

    const bump = (word, amount) => {
        if (!word || userSet.has(word) || !wordSet.has(word)) return;
        if (word.length < MIN_TARGET_WORD_LENGTH) return;
        if (!hasAtMostTwoOfAnyLetter(word)) return;
        scores.set(word, (scores.get(word) || 0) + amount);
    };

    for (const raw of userSet) {
        const word = raw.toUpperCase();

        const reversed = [...word].reverse().join('');
        if (reversed !== word) bump(reversed, REVERSE_SCORE);

        const signature = [...word].sort().join('');
        const anagrams = anagramMap.get(signature) || [];
        for (const ana of anagrams) {
            if (ana !== word) bump(ana, ANAGRAM_SCORE);
        }

        for (const letter of COMMON_LETTERS) {
            for (let i = 0; i <= word.length; i++) {
                const inserted = word.slice(0, i) + letter + word.slice(i);
                bump(inserted, INSERTION_SCORE);
            }
        }

        for (let i = 0; i < word.length; i++) {
            for (const letter of ALL_LETTERS) {
                if (letter === word[i]) continue;
                const replaced = word.slice(0, i) + letter + word.slice(i + 1);
                bump(replaced, REPLACEMENT_SCORE);
            }
        }

        bump(`${word}S`, PLURAL_S_SCORE);
    }

    for (const [word, score] of [...scores.entries()]) {
        if (wordSet.has(`${word}S`)) {
            scores.set(word, score + ACCEPTS_S_BONUS);
        }
    }

    return [...scores.entries()]
        .sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            return a[0].localeCompare(b[0]);
        })
        .slice(0, limit)
        .map(([word, score]) => ({ word, score }));
}

function isPlaceableTargetWord(word, size) {
    return (
        word.length >= MIN_TARGET_WORD_LENGTH &&
        word.length <= size * size &&
        hasAtMostTwoOfAnyLetter(word)
    );
}

function generateTargetBoard(size, weights, targetWords) {
    const eligible = targetWords.filter((w) => isPlaceableTargetWord(w, size));
    if (eligible.length === 0) return null;

    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    // Prefer longer words first so they get board space.
    shuffled.sort((a, b) => b.length - a.length || Math.random() - 0.5);

    const board = Array.from({ length: size }, () => Array(size).fill(null));
    const placed = [];
    const letterCounts = {};

    for (const word of shuffled) {
        if (placed.length >= Math.max(MIN_TARGET_WORDS_ON_BOARD + 2, 5)) break;
        const path = generatePathOnEmptyCells(board, word.length, letterCounts, word);
        if (!path) continue;
        placeWordOnBoard(board, word, path);
        for (const ch of word) {
            letterCounts[ch] = (letterCounts[ch] || 0) + 1;
        }
        placed.push(word);
    }

    if (placed.length === 0) return null;
    if (!fillEmptyCells(board, weights)) return null;
    return { board, placedTargets: placed };
}

export function wordsFromTargetList(words, targetList) {
    const targetSet = new Set(targetList.map((w) => w.toUpperCase()));
    return words.filter((w) => targetSet.has(w));
}

export function generateTargetPlayableBoard(size, weights, trie, targetWords) {
    const eligible = targetWords.filter((w) => isPlaceableTargetWord(w, size));
    if (eligible.length === 0) return null;

    const minCount = Math.min(MIN_TARGET_WORDS_ON_BOARD, eligible.length);
    let best = null;

    for (let attempt = 0; attempt < MAX_TARGET_GENERATION_ATTEMPTS; attempt++) {
        const generated = generateTargetBoard(size, weights, eligible);
        if (!generated) continue;

        const { board } = generated;
        if (hasMoreThanTwoOfAnyLetterOnBoard(board)) continue;
        if (hasChainableSameLetterTriple(board)) continue;

        const result = solveBoard(board, trie);
        const targetOnBoard = wordsFromTargetList(result.words, eligible);
        const candidate = {
            board,
            targetWords: targetOnBoard,
            seedWord: null,
            ...result,
        };

        if (targetOnBoard.length >= minCount) {
            return candidate;
        }
        if (!best || targetOnBoard.length > best.targetWords.length) {
            best = candidate;
        }
    }

    return best;
}
