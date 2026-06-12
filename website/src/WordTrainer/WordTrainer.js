import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './WordTrainer.css';
import wordlistUrl from './wordlist.txt';
import {
    buildTrieAndFrequencies,
    generatePlayableBoard,
    findWordPath,
    isWordInTrie,
    sortWordsByLength,
    wordScore,
    MIN_SCORE_SLIDER_MIN,
    MIN_SCORE_SLIDER_MAX,
    MIN_SCORE_SLIDER_STEP,
    MIN_SCORE_SLIDER_DEFAULT,
    SEED_SCORE_THRESHOLD,
} from './wordTrainerUtils';

const TIME_LIMIT_MS = 80_000;
const TIME_UP_NOTICE_MS = 3000;

function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const tenths = Math.floor((ms % 1000) / 100);
    return `${min}:${sec.toString().padStart(2, '0')}.${tenths}`;
}

function groupWordsByLength(sortedWords) {
    const groups = [];
    for (const word of sortedWords) {
        const last = groups[groups.length - 1];
        if (last && last.length === word.length) {
            last.words.push(word);
        } else {
            groups.push({ length: word.length, words: [word] });
        }
    }
    return groups;
}

function Board({ board, highlightPath, highlightFading }) {
    const size = board.length;
    const highlightSet = new Set(
        (highlightPath || []).map(([r, c]) => `${r},${c}`)
    );

    return (
        <div className={`board-grid size-${size}`}>
            {board.map((row, r) =>
                row.map((letter, c) => {
                    const isHighlighted = highlightSet.has(`${r},${c}`);
                    let className = 'board-tile';
                    if (isHighlighted) {
                        className += highlightFading ? ' highlighted fading' : ' highlighted';
                    }
                    return (
                        <div key={`${r}-${c}`} className={className}>
                            {letter}
                        </div>
                    );
                })
            )}
        </div>
    );
}

function WordList({ title, words, foundSet, showMissedStyle, seedWord }) {
    const groups = useMemo(() => groupWordsByLength(words), [words]);

    return (
        <div className="word-trainer-word-list">
            <h3>{title}</h3>
            {seedWord && (
                <p className="word-trainer-seed-word">
                    Seed word: <span>{seedWord}</span>
                </p>
            )}
            <div className="word-trainer-word-list-scroll">
                {groups.map(({ length, words: groupWords }) => (
                    <div key={length} className="word-trainer-length-group">
                        <div className="word-trainer-length-header">
                            {length} letter{length !== 1 ? 's' : ''}
                        </div>
                        <div className="word-trainer-word-bubbles">
                            {groupWords.map((word) => {
                                const isFound = foundSet ? foundSet.has(word) : true;
                                let bubbleClass = 'word-trainer-word-bubble';
                                if (showMissedStyle) {
                                    bubbleClass += isFound ? ' found' : ' missed';
                                } else {
                                    bubbleClass += ' found';
                                }
                                return (
                                    <span key={word} className={bubbleClass}>
                                        {word}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function WordTrainer() {
    const [loading, setLoading] = useState(true);
    const [trie, setTrie] = useState(null);
    const [frequencies, setFrequencies] = useState(null);
    const [seedWords, setSeedWords] = useState([]);
    const [minScoreThreshold, setMinScoreThreshold] = useState(MIN_SCORE_SLIDER_DEFAULT);
    const [inGame, setInGame] = useState(false);
    const [boardSize, setBoardSize] = useState(4);
    const [board, setBoard] = useState([]);
    const [maxScore, setMaxScore] = useState(0);
    const [allBoardWords, setAllBoardWords] = useState([]);
    const [boardSeedWord, setBoardSeedWord] = useState(null);
    const [guessedWords, setGuessedWords] = useState([]);
    const [currentScore, setCurrentScore] = useState(0);
    const [inputValue, setInputValue] = useState('');
    const [highlightPath, setHighlightPath] = useState(null);
    const [highlightFading, setHighlightFading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [generating, setGenerating] = useState(false);
    const [givenUp, setGivenUp] = useState(false);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [timerRunning, setTimerRunning] = useState(false);
    const [timeUpNotice, setTimeUpNotice] = useState(null);
    const timerStartRef = useRef(0);
    const timeUpTriggeredRef = useRef(false);
    const currentScoreRef = useRef(0);
    currentScoreRef.current = currentScore;

    const guessedSet = useMemo(() => new Set(guessedWords), [guessedWords]);
    const sortedGuessedWords = useMemo(
        () => sortWordsByLength(guessedWords),
        [guessedWords]
    );
    const sortedAnswerWords = useMemo(
        () => sortWordsByLength(allBoardWords.filter((w) => w.length >= 4)),
        [allBoardWords]
    );

    useEffect(() => {
        fetch(wordlistUrl)
            .then((r) => r.text())
            .then((text) => {
                const { trie: root, frequencies: freq, seedWords: seeds } =
                    buildTrieAndFrequencies(text);
                setTrie(root);
                setFrequencies(freq);
                setSeedWords(seeds);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (errorMessage) {
            const timer = setTimeout(() => setErrorMessage(''), 3000);
            return () => clearTimeout(timer);
        }
    }, [errorMessage]);

    useEffect(() => {
        if (!highlightPath) {
            setHighlightFading(false);
            return;
        }

        setHighlightFading(false);
        const fadeTimer = setTimeout(() => setHighlightFading(true), 500);
        const clearTimer = setTimeout(() => {
            setHighlightPath(null);
            setHighlightFading(false);
        }, 1000);

        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(clearTimer);
        };
    }, [highlightPath]);

    useEffect(() => {
        if (!timerRunning) return;

        const interval = setInterval(() => {
            setElapsedMs(Date.now() - timerStartRef.current);
        }, 100);

        return () => clearInterval(interval);
    }, [timerRunning]);

    useEffect(() => {
        if (!timerRunning || timeUpTriggeredRef.current || elapsedMs < TIME_LIMIT_MS) return;

        timeUpTriggeredRef.current = true;
        setTimeUpNotice({ score: currentScoreRef.current });
        const timer = setTimeout(() => setTimeUpNotice(null), TIME_UP_NOTICE_MS);
        return () => clearTimeout(timer);
    }, [elapsedMs, timerRunning]);

    const startNewGame = useCallback(
        (size) => {
            if (!trie || !frequencies) return;
            setGenerating(true);
            setErrorMessage('');
            setInputValue('');
            setHighlightPath(null);
            setHighlightFading(false);
            setGuessedWords([]);
            setCurrentScore(0);
            setGivenUp(false);
            setElapsedMs(0);
            setTimeUpNotice(null);
            timeUpTriggeredRef.current = false;
            timerStartRef.current = Date.now();
            setTimerRunning(false);

            requestAnimationFrame(() => {
                const { board: newBoard, totalScore, words, seedWord } = generatePlayableBoard(
                    size,
                    frequencies,
                    trie,
                    minScoreThreshold,
                    seedWords
                );
                setBoard(newBoard);
                setMaxScore(totalScore);
                setAllBoardWords(words);
                setBoardSeedWord(seedWord);
                setBoardSize(size);
                setInGame(true);
                timerStartRef.current = Date.now();
                setTimerRunning(true);
                setGenerating(false);
            });
        },
        [trie, frequencies, minScoreThreshold, seedWords]
    );

    const handleGiveUp = () => {
        setGivenUp(true);
        setTimerRunning(false);
        setHighlightPath(null);
        setHighlightFading(false);
    };

    const handleSubmit = () => {
        if (givenUp) return;

        const word = inputValue.trim().toUpperCase();
        setInputValue('');

        if (word.length < 3) {
            setErrorMessage('Words must be at least 3 letters long.');
            return;
        }
        if (guessedSet.has(word)) {
            setErrorMessage("You've already found that word!");
            return;
        }
        if (!isWordInTrie(trie, word)) {
            setErrorMessage('Not in the word list.');
            return;
        }

        const path = findWordPath(board, word);
        if (!path) {
            setErrorMessage("That word can't be formed on this board.");
            return;
        }

        setGuessedWords((prev) => [...prev, word]);
        setCurrentScore((prev) => prev + wordScore(word));
        setHighlightPath(path);
        setErrorMessage('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
        }
    };

    if (loading) {
        return <div className="word-trainer-loading">Loading word list…</div>;
    }

    if (!inGame) {
        return (
            <div className="word-trainer-setup">
                <h1>Word Trainer</h1>
                <p>Practice grid word-finding — type words and press Enter.</p>
                <div className="board-size-options">
                    <button
                        className={boardSize === 4 ? 'selected' : ''}
                        onClick={() => setBoardSize(4)}
                    >
                        4×4
                    </button>
                    <button
                        className={boardSize === 5 ? 'selected' : ''}
                        onClick={() => setBoardSize(5)}
                    >
                        5×5
                    </button>
                </div>
                <div className="slider-container">
                    <label>
                        Min total score: {minScoreThreshold.toLocaleString()}
                        {minScoreThreshold >= SEED_SCORE_THRESHOLD && (
                            <span className="slider-hint"> (seeded)</span>
                        )}
                    </label>
                    <input
                        type="range"
                        min={MIN_SCORE_SLIDER_MIN}
                        max={MIN_SCORE_SLIDER_MAX}
                        step={MIN_SCORE_SLIDER_STEP}
                        value={minScoreThreshold}
                        onChange={(e) => setMinScoreThreshold(Number(e.target.value))}
                    />
                </div>
                <button onClick={() => startNewGame(boardSize)} disabled={generating}>
                    {generating ? 'Generating…' : 'New Game'}
                </button>
            </div>
        );
    }

    return (
        <div className="word-trainer-game">
            <div className="word-trainer-timer">{formatTime(elapsedMs)}</div>

            <div className="word-trainer-layout">
                <div className="word-trainer-sidebar word-trainer-sidebar-left">
                    {givenUp && (
                        <WordList
                            title="All Words (4+ letters)"
                            words={sortedAnswerWords}
                            foundSet={guessedSet}
                            showMissedStyle
                            seedWord={boardSeedWord}
                        />
                    )}
                </div>

                <div className="word-trainer-center">
                    <div className="word-trainer-stats">
                        <span>
                            Score: <strong>{currentScore.toLocaleString()}</strong> /{' '}
                            {maxScore.toLocaleString()}
                        </span>
                    </div>

                    <div className="word-trainer-message-area">
                        {timeUpNotice && (
                            <p className="word-trainer-times-up">
                                Time&apos;s up! Score: {timeUpNotice.score.toLocaleString()}
                            </p>
                        )}
                        {!timeUpNotice && errorMessage && (
                            <p className="word-trainer-error">{errorMessage}</p>
                        )}
                    </div>

                    <Board
                        board={board}
                        highlightPath={highlightPath}
                        highlightFading={highlightFading}
                    />

                    <input
                        type="text"
                        className="word-trainer-input"
                        value={inputValue}
                        onChange={(e) => {
                            if (errorMessage) setErrorMessage('');
                            setInputValue(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''));
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder={givenUp ? 'Game over' : 'Type a word…'}
                        disabled={givenUp}
                        autoFocus
                    />

                    <div className="word-trainer-actions">
                        {!givenUp && (
                            <button className="give-up-btn" onClick={handleGiveUp}>
                                Give Up
                            </button>
                        )}
                        <button onClick={() => startNewGame(4)} disabled={generating}>
                            New 4×4
                        </button>
                        <button onClick={() => startNewGame(5)} disabled={generating}>
                            New 5×5
                        </button>
                    </div>
                </div>

                <div className="word-trainer-sidebar word-trainer-sidebar-right">
                    <WordList title="Found Words" words={sortedGuessedWords} />
                </div>
            </div>
        </div>
    );
}

export default WordTrainer;
