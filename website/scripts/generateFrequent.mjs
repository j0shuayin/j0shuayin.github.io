import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
    buildTrieAndFrequencies,
    generatePlayableBoard,
} from '../src/WordTrainer/wordTrainerUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORDLIST_PATH = join(__dirname, '../src/WordTrainer/wordlist.txt');
const OUTPUT_DIR = join(__dirname, '../src/WordTrainer');

const BOARD_COUNT = 10_000;
const MIN_SCORE = 100_000;
const BOARD_SIZE = 4;

const LENGTH_OUTPUTS = [
    { length: 4, topN: 1000, filename: 'frequent_4_1000.txt' },
    { length: 5, topN: 1000, filename: 'frequent_5_1000.txt' },
    { length: 6, topN: 750, filename: 'frequent_6_750.txt' },
    { length: 7, topN: 500, filename: 'frequent_7_500.txt' },
];

const EMPTY_SEED_WORDS = [];

function generateValidBoard(size, weights, trie, minScore) {
    while (true) {
        const result = generatePlayableBoard(size, weights, trie, minScore, EMPTY_SEED_WORDS);
        if (result && result.totalScore >= minScore) {
            return result;
        }
    }
}

function rankWords(wordCounts, topN) {
    return [...wordCounts.entries()]
        .sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            return a[0].localeCompare(b[0]);
        })
        .slice(0, topN);
}

function main() {
    const wordlistText = readFileSync(WORDLIST_PATH, 'utf8');
    const { trie, frequencies: weights } = buildTrieAndFrequencies(wordlistText);

    const countsByLength = new Map(
        LENGTH_OUTPUTS.map(({ length }) => [length, new Map()])
    );
    const start = Date.now();

    for (let i = 0; i < BOARD_COUNT; i++) {
        const { words } = generateValidBoard(BOARD_SIZE, weights, trie, MIN_SCORE);

        for (const word of words) {
            const counts = countsByLength.get(word.length);
            if (!counts) continue;
            counts.set(word, (counts.get(word) || 0) + 1);
        }

        if ((i + 1) % 100 === 0 || i === 0) {
            const elapsed = ((Date.now() - start) / 1000).toFixed(1);
            console.log(`Generated ${i + 1}/${BOARD_COUNT} boards (${elapsed}s)`);
        }
    }

    for (const { length, topN, filename } of LENGTH_OUTPUTS) {
        const counts = countsByLength.get(length);
        const ranked = rankWords(counts, topN);
        const outputPath = join(OUTPUT_DIR, filename);
        writeFileSync(
            outputPath,
            ranked.map(([word]) => word).join('\n') + (ranked.length ? '\n' : ''),
            'utf8'
        );

        const top = ranked[0];
        console.log(
            `Wrote ${ranked.length} words to ${filename}` +
                (top ? ` (top: ${top[0]} on ${top[1]} boards, ${counts.size} unique)` : '')
        );
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`Done in ${elapsed}s`);
}

main();
