import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
    commonLetterRatio,
    isValidSeedWord,
} from '../src/WordTrainer/wordTrainerUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORDLIST_PATH = join(__dirname, '../src/WordTrainer/wordlist.txt');
const OUTPUT_PATH = join(__dirname, '../src/WordTrainer/seedwords_70.txt');
const COMMON_LETTER_THRESHOLD = 0.7;

function main() {
    const words = [];

    for (const line of readFileSync(WORDLIST_PATH, 'utf8').split('\n')) {
        const word = line.trim().toUpperCase();
        if (!isValidSeedWord(word)) continue;
        if (commonLetterRatio(word) >= COMMON_LETTER_THRESHOLD) {
            words.push(word);
        }
    }

    writeFileSync(OUTPUT_PATH, words.join('\n') + (words.length ? '\n' : ''), 'utf8');
    console.log(
        `Wrote ${words.length} words to seedwords_70.txt (>= ${COMMON_LETTER_THRESHOLD * 100}% common letters)`
    );
}

main();
