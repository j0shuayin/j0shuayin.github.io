import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import './WordTrainer.css';
import wordlistUrl from './wordlist.txt';
import seedwords70Url from './seedwords_70.txt';
import frequent4Url from './frequent_4_1000.txt';
import frequent5Url from './frequent_5_1000.txt';
import frequent6Url from './frequent_6_1000.txt';
import frequent7Url from './frequent_7_1000.txt';
import {
    buildTrieAndFrequencies,
    parseSeedWordsText,
    generatePlayableBoard,
    generateSuffixPlayableBoard,
    generateDoublePlayableBoard,
    generateTargetPlayableBoard,
    findWordPath,
    findAllSuffixPaths,
    findAllDoublePairPaths,
    isWordInTrie,
    sortWordsByLength,
    wordsEndingWithSuffix,
    wordsContainingDoublePair,
    wordsFromTargetList,
    getSuffixExtensionWords,
    parseTargetWordListText,
    getRecommendedTargetWords,
    formatTargetWordListForExport,
    wordScore,
    MIN_SCORE_SLIDER_MIN,
    MIN_SCORE_SLIDER_MAX,
    MIN_SCORE_SLIDER_STEP,
    MIN_SCORE_SLIDER_DEFAULT,
    SEED_SCORE_THRESHOLD,
    SUFFIX_OPTIONS,
    DOUBLE_PAIR_OPTIONS,
} from './wordTrainerUtils';

const TIME_LIMIT_MS = 80_000;
const TIME_UP_NOTICE_MS = 3000;
const SUFFIX_FADE_MS = 2000;
const SUFFIX_CYCLE_MS = 4000;
const HOVER_LETTER_MS = 200;
const TARGET_LIST_STORAGE_KEY = 'wordTrainer.targetWordList';

function loadStoredTargetListText() {
    try {
        return localStorage.getItem(TARGET_LIST_STORAGE_KEY) || '';
    } catch {
        return '';
    }
}

function parseWordSet(text) {
    return new Set(
        text
            .split('\n')
            .map((line) => line.trim().split(/\s+/)[0].toUpperCase())
            .filter(Boolean)
    );
}

function buildFrequentWordSet(...texts) {
    const words = new Set();
    for (const text of texts) {
        for (const word of parseWordSet(text)) {
            words.add(word);
        }
    }
    return words;
}

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

function getBubbleClass({
    word,
    isFound,
    showMissedStyle,
    showFoundListStyle,
    targetWordsSet,
    extensionWordsSet,
    frequentWords,
}) {
    let bubbleClass = 'word-trainer-word-bubble';

    if (showFoundListStyle && targetWordsSet) {
        if (targetWordsSet.has(word)) {
            bubbleClass += ' found';
        } else {
            bubbleClass += ' off-target';
        }
        return bubbleClass;
    }

    if (showMissedStyle) {
        if (isFound) {
            bubbleClass += ' found';
        } else if (extensionWordsSet?.has(word)) {
            bubbleClass += ' extension';
        } else if (frequentWords?.has(word)) {
            bubbleClass += ' frequent';
        } else {
            bubbleClass += ' missed';
        }
    } else {
        bubbleClass += ' found';
    }

    return bubbleClass;
}

function getPreviewTileCount(path, progress) {
    if (!path || path.length === 0 || progress < 0) return 0;
    return Math.min(Math.floor(progress) + 1, path.length);
}

function getSegmentDrawPoints(seg) {
    return {
        start: { x: seg.cx1, y: seg.cy1 },
        end: { x: seg.cx2, y: seg.cy2 },
    };
}

function Board({
    board,
    highlightPath,
    highlightFading,
    previewPath,
    previewRevealProgress,
    suffixPath,
    suffixHighlightEnabled,
    suffixHighlightFading,
}) {
    const size = board.length;
    const containerRef = useRef(null);
    const tileRefs = useRef({});
    const [segmentCoords, setSegmentCoords] = useState([]);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

    const highlightSet = new Set(
        (highlightPath || []).map(([r, c]) => `${r},${c}`)
    );
    const previewTileCount = getPreviewTileCount(previewPath, previewRevealProgress);
    const previewSet = new Set(
        (previewPath || [])
            .slice(0, previewTileCount)
            .map(([r, c]) => `${r},${c}`)
    );
    const suffixSet = new Set(
        (suffixPath || []).map(([r, c]) => `${r},${c}`)
    );

    const updateSegmentCoords = useCallback(() => {
        if (!containerRef.current) {
            setSegmentCoords([]);
            setContainerSize({ width: 0, height: 0 });
            return;
        }

        setContainerSize({
            width: containerRef.current.offsetWidth,
            height: containerRef.current.offsetHeight,
        });

        if (!previewPath || previewPath.length < 2) {
            setSegmentCoords([]);
            return;
        }

        const containerRect = containerRef.current.getBoundingClientRect();
        const segments = [];

        for (let i = 0; i < previewPath.length - 1; i++) {
            const [r1, c1] = previewPath[i];
            const [r2, c2] = previewPath[i + 1];
            const el1 = tileRefs.current[`${r1},${c1}`];
            const el2 = tileRefs.current[`${r2},${c2}`];
            if (!el1 || !el2) continue;

            const rect1 = el1.getBoundingClientRect();
            const rect2 = el2.getBoundingClientRect();
            segments.push({
                cx1: rect1.left + rect1.width / 2 - containerRect.left,
                cy1: rect1.top + rect1.height / 2 - containerRect.top,
                cx2: rect2.left + rect2.width / 2 - containerRect.left,
                cy2: rect2.top + rect2.height / 2 - containerRect.top,
            });
        }

        setSegmentCoords(segments);
    }, [previewPath]);

    useLayoutEffect(() => {
        updateSegmentCoords();
    }, [updateSegmentCoords, previewPath]);

    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver(updateSegmentCoords);
        observer.observe(containerRef.current);
        window.addEventListener('resize', updateSegmentCoords);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateSegmentCoords);
        };
    }, [updateSegmentCoords]);

    const tiles = board.flatMap((row, r) =>
        row.map((letter, c) => {
            const key = `${r},${c}`;
            const isGuessHighlighted = highlightSet.has(key);
            const isPreviewHighlighted =
                previewSet.has(key) && !isGuessHighlighted;
            const isSuffixHighlighted =
                suffixHighlightEnabled &&
                suffixSet.has(key) &&
                !isGuessHighlighted &&
                !isPreviewHighlighted;
            let className = 'board-tile';
            if (isGuessHighlighted) {
                className += highlightFading ? ' highlighted fading' : ' highlighted';
            } else if (isPreviewHighlighted) {
                className += ' preview-highlighted';
            } else if (isSuffixHighlighted) {
                className += suffixHighlightFading
                    ? ' suffix-highlighted fading'
                    : ' suffix-highlighted';
            }
            return { key, letter, className };
        })
    );

    return (
        <div className="board-container" ref={containerRef}>
            <div className={`board-grid size-${size}`}>
                {tiles.map(({ key, letter, className }) => (
                    <div
                        key={key}
                        ref={(el) => {
                            tileRefs.current[key] = el;
                        }}
                        className={className}
                        aria-label={letter}
                    />
                ))}
            </div>
            {segmentCoords.length > 0 && containerSize.width > 0 && (
                <svg
                    className="board-path-lines"
                    width={containerSize.width}
                    height={containerSize.height}
                    aria-hidden="true"
                >
                    {segmentCoords.map((seg, i) => {
                        const segProgress = Math.max(
                            0,
                            Math.min(1, previewRevealProgress - i)
                        );
                        if (segProgress <= 0) return null;

                        const { start, end } = getSegmentDrawPoints(seg);
                        const x2 = start.x + (end.x - start.x) * segProgress;
                        const y2 = start.y + (end.y - start.y) * segProgress;

                        return (
                            <line
                                key={i}
                                x1={start.x}
                                y1={start.y}
                                x2={x2}
                                y2={y2}
                                stroke="#42a5f5"
                                strokeWidth="5"
                                strokeLinecap="round"
                            />
                        );
                    })}
                </svg>
            )}
            <div className={`board-grid board-letters-overlay size-${size}`}>
                {tiles.map(({ key, letter, className }) => (
                    <div key={key} className={className}>
                        <span className="board-tile-letter">{letter}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function WordList({
    title,
    words,
    foundSet,
    showMissedStyle,
    showFoundListStyle,
    targetWordsSet,
    extensionWordsSet,
    frequentWords,
    seedWord,
    hoverWord,
    onWordHover,
    onWordLeave,
}) {
    const groups = useMemo(() => groupWordsByLength(words), [words]);
    const isInteractive = Boolean(onWordHover);

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
                                let bubbleClass = getBubbleClass({
                                    word,
                                    isFound,
                                    showMissedStyle,
                                    showFoundListStyle,
                                    targetWordsSet,
                                    extensionWordsSet,
                                    frequentWords,
                                });
                                if (hoverWord === word) bubbleClass += ' hovering';
                                if (isInteractive) bubbleClass += ' interactive';
                                return (
                                    <span
                                        key={word}
                                        className={bubbleClass}
                                        onMouseEnter={() => onWordHover(word)}
                                        onMouseLeave={onWordLeave}
                                    >
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
    const [dictionaryWordSet, setDictionaryWordSet] = useState(() => new Set());
    const [anagramMap, setAnagramMap] = useState(() => new Map());
    const [frequentWords, setFrequentWords] = useState(() => new Set());
    const [minScoreThreshold, setMinScoreThreshold] = useState(MIN_SCORE_SLIDER_DEFAULT);
    const [setupTab, setSetupTab] = useState('standard');
    const [selectedSuffix, setSelectedSuffix] = useState('ing');
    const [selectedDoublePair, setSelectedDoublePair] = useState('tt');
    const [targetListText, setTargetListText] = useState(loadStoredTargetListText);
    const [exportNotice, setExportNotice] = useState('');
    const [gameMode, setGameMode] = useState('standard');
    const [boardSuffix, setBoardSuffix] = useState(null);
    const [boardDoublePair, setBoardDoublePair] = useState(null);
    const [boardTargetList, setBoardTargetList] = useState([]);
    const [maxTargetWordCount, setMaxTargetWordCount] = useState(0);
    const [showTargetWordTotal, setShowTargetWordTotal] = useState(true);
    const [suffixHighlightEnabled, setSuffixHighlightEnabled] = useState(false);
    const [suffixPathIndex, setSuffixPathIndex] = useState(0);
    const [suffixHighlightFading, setSuffixHighlightFading] = useState(false);
    const [showSuffixWordTotal, setShowSuffixWordTotal] = useState(true);
    const [showDoubleWordTotal, setShowDoubleWordTotal] = useState(true);
    const [maxSuffixWordCount, setMaxSuffixWordCount] = useState(0);
    const [maxDoubleWordCount, setMaxDoubleWordCount] = useState(0);
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
    const [hoverWord, setHoverWord] = useState(null);
    const [hoverPath, setHoverPath] = useState(null);
    const [hoverRevealProgress, setHoverRevealProgress] = useState(0);
    const timerStartRef = useRef(0);
    const timeUpTriggeredRef = useRef(false);
    const currentScoreRef = useRef(0);
    const suffixWordsFoundRef = useRef(0);
    const doubleWordsFoundRef = useRef(0);
    const targetWordsFoundRef = useRef(0);
    const gameModeRef = useRef(gameMode);

    const guessedSet = useMemo(() => new Set(guessedWords), [guessedWords]);
    const sortedGuessedWords = useMemo(
        () => sortWordsByLength(guessedWords),
        [guessedWords]
    );
    const sortedAnswerWords = useMemo(() => {
        let words;
        if (gameMode === 'suffix' && boardSuffix) {
            const suffixWords = wordsEndingWithSuffix(allBoardWords, boardSuffix);
            const extensions = getSuffixExtensionWords(allBoardWords, boardSuffix);
            words = [...suffixWords, ...extensions];
        } else if (gameMode === 'double' && boardDoublePair) {
            words = wordsContainingDoublePair(allBoardWords, boardDoublePair);
        } else if (gameMode === 'target' && boardTargetList.length > 0) {
            words = wordsFromTargetList(allBoardWords, boardTargetList);
        } else {
            words = allBoardWords.filter((w) => w.length >= 4);
        }
        return sortWordsByLength(words);
    }, [allBoardWords, gameMode, boardSuffix, boardDoublePair, boardTargetList]);

    const targetWordsSet = useMemo(() => {
        if (gameMode === 'suffix' && boardSuffix) {
            return new Set(wordsEndingWithSuffix(allBoardWords, boardSuffix));
        }
        if (gameMode === 'double' && boardDoublePair) {
            return new Set(wordsContainingDoublePair(allBoardWords, boardDoublePair));
        }
        if (gameMode === 'target' && boardTargetList.length > 0) {
            return new Set(wordsFromTargetList(allBoardWords, boardTargetList));
        }
        return new Set(sortedAnswerWords);
    }, [allBoardWords, gameMode, boardSuffix, boardDoublePair, boardTargetList, sortedAnswerWords]);

    const parsedTargetList = useMemo(() => {
        const parsed = parseTargetWordListText(targetListText);
        if (dictionaryWordSet.size === 0) return parsed;

        const words = [];
        const notInDict = [];
        for (const word of parsed.words) {
            if (dictionaryWordSet.has(word)) words.push(word);
            else notInDict.push(word);
        }
        return {
            words,
            skipped: [...parsed.skipped, ...notInDict],
        };
    }, [targetListText, dictionaryWordSet]);

    const recommendedTargets = useMemo(() => {
        if (parsedTargetList.words.length === 0 || dictionaryWordSet.size === 0) return [];
        return getRecommendedTargetWords(
            parsedTargetList.words,
            dictionaryWordSet,
            anagramMap,
            100
        );
    }, [parsedTargetList.words, dictionaryWordSet, anagramMap]);

    const suffixExtensionWordsSet = useMemo(() => {
        if (gameMode !== 'suffix' || !boardSuffix || board.length === 0) {
            return new Set();
        }
        return new Set(getSuffixExtensionWords(allBoardWords, boardSuffix));
    }, [allBoardWords, boardSuffix, board, gameMode]);

    const isTrainerMode =
        gameMode === 'suffix' || gameMode === 'double' || gameMode === 'target';

    const allFeaturePaths = useMemo(() => {
        if (gameMode === 'suffix' && boardSuffix && board.length > 0) {
            return findAllSuffixPaths(board, boardSuffix);
        }
        if (gameMode === 'double' && boardDoublePair && board.length > 0) {
            return findAllDoublePairPaths(board, boardDoublePair);
        }
        return [];
    }, [board, boardSuffix, boardDoublePair, gameMode]);

    const activeFeaturePath = useMemo(() => {
        if (!suffixHighlightEnabled || allFeaturePaths.length === 0) return null;
        return allFeaturePaths[suffixPathIndex % allFeaturePaths.length];
    }, [suffixHighlightEnabled, allFeaturePaths, suffixPathIndex]);

    const suffixWordsFoundCount = useMemo(() => {
        if (!boardSuffix) return 0;
        const upper = boardSuffix.toUpperCase();
        return guessedWords.filter((w) => w.endsWith(upper)).length;
    }, [guessedWords, boardSuffix]);

    const doubleWordsFoundCount = useMemo(() => {
        if (!boardDoublePair) return 0;
        return wordsContainingDoublePair(guessedWords, boardDoublePair).length;
    }, [guessedWords, boardDoublePair]);

    const targetWordsFoundCount = useMemo(() => {
        if (boardTargetList.length === 0) return 0;
        return wordsFromTargetList(guessedWords, boardTargetList).length;
    }, [guessedWords, boardTargetList]);

    currentScoreRef.current = currentScore;
    suffixWordsFoundRef.current = suffixWordsFoundCount;
    doubleWordsFoundRef.current = doubleWordsFoundCount;
    targetWordsFoundRef.current = targetWordsFoundCount;
    gameModeRef.current = gameMode;

    const handleWordHover = useCallback(
        (word) => {
            const path = findWordPath(board, word);
            if (!path) return;
            setHoverWord(word);
            setHoverPath(path);
            setHoverRevealProgress(0);
        },
        [board]
    );

    const handleWordLeave = useCallback(() => {
        setHoverWord(null);
        setHoverPath(null);
        setHoverRevealProgress(0);
    }, []);

    useEffect(() => {
        if (!hoverPath) {
            setHoverRevealProgress(0);
            return;
        }

        const start = performance.now();
        let raf;

        const tick = (now) => {
            const progress = Math.min(
                (now - start) / HOVER_LETTER_MS,
                hoverPath.length
            );
            setHoverRevealProgress(progress);
            if (progress < hoverPath.length) {
                raf = requestAnimationFrame(tick);
            }
        };

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [hoverPath, hoverWord]);

    useEffect(() => {
        Promise.all([
            fetch(wordlistUrl).then((r) => r.text()),
            fetch(seedwords70Url).then((r) => r.text()),
            fetch(frequent4Url).then((r) => r.text()),
            fetch(frequent5Url).then((r) => r.text()),
            fetch(frequent6Url).then((r) => r.text()),
            fetch(frequent7Url).then((r) => r.text()),
        ])
            .then(([
                wordlistText,
                seed70Text,
                frequent4Text,
                frequent5Text,
                frequent6Text,
                frequent7Text,
            ]) => {
                const { trie: root, frequencies: freq, wordSet, anagramMap: anaMap } =
                    buildTrieAndFrequencies(wordlistText);
                setTrie(root);
                setFrequencies(freq);
                setDictionaryWordSet(wordSet);
                setAnagramMap(anaMap);
                setSeedWords(parseSeedWordsText(seed70Text));
                setFrequentWords(
                    buildFrequentWordSet(
                        frequent4Text,
                        frequent5Text,
                        frequent6Text,
                        frequent7Text
                    )
                );
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
        if (
            !suffixHighlightEnabled ||
            (gameMode !== 'suffix' && gameMode !== 'double') ||
            allFeaturePaths.length === 0
        ) {
            setSuffixPathIndex(0);
            setSuffixHighlightFading(false);
            return;
        }

        let fadeOutTimeout;
        let nextTimeout;
        let cancelled = false;

        const showConfig = (i) => {
            if (cancelled) return;
            setSuffixPathIndex(i);
            setSuffixHighlightFading(false);
            fadeOutTimeout = setTimeout(() => {
                if (!cancelled) setSuffixHighlightFading(true);
            }, SUFFIX_FADE_MS);
            nextTimeout = setTimeout(() => {
                if (!cancelled) showConfig((i + 1) % allFeaturePaths.length);
            }, SUFFIX_CYCLE_MS);
        };

        showConfig(0);
        return () => {
            cancelled = true;
            clearTimeout(fadeOutTimeout);
            clearTimeout(nextTimeout);
        };
    }, [suffixHighlightEnabled, gameMode, allFeaturePaths]);

    useEffect(() => {
        if (!timerRunning || timeUpTriggeredRef.current || elapsedMs < TIME_LIMIT_MS) return;

        timeUpTriggeredRef.current = true;
        setTimeUpNotice({
            score: currentScoreRef.current,
            wordsFound: suffixWordsFoundRef.current,
            doubleWordsFound: doubleWordsFoundRef.current,
            targetWordsFound: targetWordsFoundRef.current,
            isSuffix: gameModeRef.current === 'suffix',
            isDouble: gameModeRef.current === 'double',
            isTarget: gameModeRef.current === 'target',
        });
        const timer = setTimeout(() => setTimeUpNotice(null), TIME_UP_NOTICE_MS);
        return () => clearTimeout(timer);
    }, [elapsedMs, timerRunning]);

    const resetGameState = () => {
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
        setHoverWord(null);
        setHoverPath(null);
        setHoverRevealProgress(0);
    };

    const startNewGame = useCallback(
        (size) => {
            if (!trie || !frequencies) return;
            setGenerating(true);
            resetGameState();
            setGameMode('standard');
            setBoardSuffix(null);
            setBoardDoublePair(null);
            setBoardTargetList([]);
            setBoardSeedWord(null);
            setMaxSuffixWordCount(0);
            setMaxDoubleWordCount(0);
            setMaxTargetWordCount(0);

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

    const startSuffixGame = useCallback(
        (size, suffix) => {
            if (!trie || !frequencies) return;
            setGenerating(true);
            resetGameState();
            setGameMode('suffix');
            setBoardSuffix(suffix.toUpperCase());
            setBoardDoublePair(null);
            setBoardTargetList([]);
            setBoardSeedWord(null);

            requestAnimationFrame(() => {
                const result = generateSuffixPlayableBoard(size, frequencies, trie, suffix);
                if (!result) {
                    setGenerating(false);
                    return;
                }
                setBoard(result.board);
                setMaxScore(result.totalScore);
                setMaxSuffixWordCount(result.suffixWords.length);
                setAllBoardWords(result.words);
                setBoardSize(size);
                setInGame(true);
                timerStartRef.current = Date.now();
                setTimerRunning(true);
                setGenerating(false);
            });
        },
        [trie, frequencies]
    );

    const startDoubleGame = useCallback(
        (size, doublePair) => {
            if (!trie || !frequencies) return;
            setGenerating(true);
            resetGameState();
            setGameMode('double');
            setBoardDoublePair(doublePair.toUpperCase());
            setBoardSuffix(null);
            setBoardTargetList([]);
            setBoardSeedWord(null);

            requestAnimationFrame(() => {
                const result = generateDoublePlayableBoard(size, frequencies, trie, doublePair);
                if (!result) {
                    setGenerating(false);
                    return;
                }
                setBoard(result.board);
                setMaxScore(result.totalScore);
                setMaxDoubleWordCount(result.doubleWords.length);
                setAllBoardWords(result.words);
                setBoardSize(size);
                setInGame(true);
                timerStartRef.current = Date.now();
                setTimerRunning(true);
                setGenerating(false);
            });
        },
        [trie, frequencies]
    );

    const updateTargetListText = useCallback((text) => {
        setTargetListText(text);
        setErrorMessage('');
        try {
            localStorage.setItem(TARGET_LIST_STORAGE_KEY, text);
        } catch {
            // ignore quota / private mode
        }
    }, []);

    const addRecommendedWord = useCallback(
        (word) => {
            const upper = word.toUpperCase();
            if (parsedTargetList.words.includes(upper)) return;
            const next = parsedTargetList.words.length
                ? `${formatTargetWordListForExport(parsedTargetList.words)}\n${upper.toLowerCase()}`
                : upper.toLowerCase();
            updateTargetListText(next);
        },
        [parsedTargetList.words, updateTargetListText]
    );

    const handleExportTargetList = useCallback(async () => {
        const payload = formatTargetWordListForExport(parsedTargetList.words);
        if (!payload) {
            setExportNotice('Add words before exporting.');
            return;
        }
        try {
            await navigator.clipboard.writeText(payload);
            setExportNotice(`Copied ${parsedTargetList.words.length} words.`);
        } catch {
            setExportNotice('Could not copy to clipboard.');
        }
    }, [parsedTargetList.words]);

    useEffect(() => {
        if (!exportNotice) return;
        const timer = setTimeout(() => setExportNotice(''), 2500);
        return () => clearTimeout(timer);
    }, [exportNotice]);

    const startTargetGame = useCallback(
        (size) => {
            if (!trie || !frequencies) return;
            const { words } = parseTargetWordListText(targetListText);
            if (words.length === 0) {
                setErrorMessage('Paste at least one valid target word (4+ letters).');
                return;
            }

            setGenerating(true);
            resetGameState();
            setGameMode('target');
            setBoardTargetList(words);
            setBoardSuffix(null);
            setBoardDoublePair(null);
            setBoardSeedWord(null);

            requestAnimationFrame(() => {
                const result = generateTargetPlayableBoard(size, frequencies, trie, words);
                if (!result) {
                    setGenerating(false);
                    setErrorMessage('Could not generate a board with enough target words.');
                    return;
                }
                setBoard(result.board);
                setMaxScore(result.totalScore);
                setMaxTargetWordCount(result.targetWords.length);
                setAllBoardWords(result.words);
                setBoardSize(size);
                setInGame(true);
                timerStartRef.current = Date.now();
                setTimerRunning(true);
                setGenerating(false);
            });
        },
        [trie, frequencies, targetListText]
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

                <div className="setup-tabs">
                    <button
                        className={setupTab === 'standard' ? 'selected' : ''}
                        onClick={() => setSetupTab('standard')}
                    >
                        Standard
                    </button>
                    <button
                        className={setupTab === 'suffix' ? 'selected' : ''}
                        onClick={() => setSetupTab('suffix')}
                    >
                        Suffixes
                    </button>
                    <button
                        className={setupTab === 'double' ? 'selected' : ''}
                        onClick={() => setSetupTab('double')}
                    >
                        Doubles
                    </button>
                    <button
                        className={setupTab === 'target' ? 'selected' : ''}
                        onClick={() => setSetupTab('target')}
                    >
                        Targets
                    </button>
                </div>

                <div className="word-trainer-setup-panel">
                    {setupTab === 'standard' && (
                        <>
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
                        </>
                    )}

                    {setupTab === 'suffix' && (
                        <>
                            <p className="word-trainer-setup-hint">
                                Boards include the chosen suffix.
                            </p>
                            <div className="suffix-options">
                                {SUFFIX_OPTIONS.map((suffix) => (
                                    <button
                                        key={suffix}
                                        className={selectedSuffix === suffix ? 'selected' : ''}
                                        onClick={() => setSelectedSuffix(suffix)}
                                    >
                                        -{suffix}
                                    </button>
                                ))}
                            </div>
                            <label className="suffix-setup-toggle">
                                <input
                                    type="checkbox"
                                    checked={showSuffixWordTotal}
                                    onChange={(e) => setShowSuffixWordTotal(e.target.checked)}
                                />
                                Show total valid suffix words on board
                            </label>
                            <div className="board-size-options">
                                <button
                                    onClick={() => startSuffixGame(4, selectedSuffix)}
                                    disabled={generating}
                                >
                                    {generating ? 'Generating…' : 'Suffix Trainer 4×4'}
                                </button>
                                <button
                                    onClick={() => startSuffixGame(5, selectedSuffix)}
                                    disabled={generating}
                                >
                                    {generating ? 'Generating…' : 'Suffix Trainer 5×5'}
                                </button>
                            </div>
                        </>
                    )}

                    {setupTab === 'double' && (
                        <>
                            <p className="word-trainer-setup-hint">
                                Boards include an adjacent pair of the chosen letters.
                            </p>
                            <div className="suffix-options double-pair-options">
                                {DOUBLE_PAIR_OPTIONS.map((pair) => (
                                    <button
                                        key={pair}
                                        className={selectedDoublePair === pair ? 'selected' : ''}
                                        onClick={() => setSelectedDoublePair(pair)}
                                    >
                                        {pair}
                                    </button>
                                ))}
                            </div>
                            <label className="suffix-setup-toggle">
                                <input
                                    type="checkbox"
                                    checked={showDoubleWordTotal}
                                    onChange={(e) => setShowDoubleWordTotal(e.target.checked)}
                                />
                                Show total valid double-letter words on board
                            </label>
                            <div className="board-size-options">
                                <button
                                    onClick={() => startDoubleGame(4, selectedDoublePair)}
                                    disabled={generating}
                                >
                                    {generating ? 'Generating…' : 'Double Trainer 4×4'}
                                </button>
                                <button
                                    onClick={() => startDoubleGame(5, selectedDoublePair)}
                                    disabled={generating}
                                >
                                    {generating ? 'Generating…' : 'Double Trainer 5×5'}
                                </button>
                            </div>
                        </>
                    )}

                    {setupTab === 'target' && (
                        <>
                            <p className="word-trainer-setup-hint">
                                Paste words to drill (one per line). Slash groups and reversals
                                work too — e.g. snath/sneath or ante -&gt; etna.
                            </p>
                            <textarea
                                className="target-list-input"
                                value={targetListText}
                                onChange={(e) => updateTargetListText(e.target.value)}
                                placeholder={'snath/sneath/snathe\nante -> etna\nrest'}
                                rows={8}
                            />
                            <div className="target-list-meta">
                                <span>
                                    {parsedTargetList.words.length} word
                                    {parsedTargetList.words.length === 1 ? '' : 's'} ready
                                </span>
                                <button
                                    type="button"
                                    className="target-export-btn"
                                    onClick={handleExportTargetList}
                                    disabled={parsedTargetList.words.length === 0}
                                >
                                    Export to clipboard
                                </button>
                            </div>
                            {exportNotice && (
                                <p className="target-export-notice">{exportNotice}</p>
                            )}
                            {parsedTargetList.skipped.length > 0 && (
                                <p className="word-trainer-setup-hint">
                                    Skipped (short, repeats, or not in dictionary):{' '}
                                    {parsedTargetList.skipped.slice(0, 8).join(', ')}
                                    {parsedTargetList.skipped.length > 8 ? '…' : ''}
                                </p>
                            )}
                            {errorMessage && setupTab === 'target' && (
                                <p className="word-trainer-error">{errorMessage}</p>
                            )}
                            <label className="suffix-setup-toggle">
                                <input
                                    type="checkbox"
                                    checked={showTargetWordTotal}
                                    onChange={(e) => setShowTargetWordTotal(e.target.checked)}
                                />
                                Show total target words on board
                            </label>
                            <div className="board-size-options">
                                <button
                                    onClick={() => startTargetGame(4)}
                                    disabled={generating || parsedTargetList.words.length === 0}
                                >
                                    {generating ? 'Generating…' : 'Target Trainer 4×4'}
                                </button>
                                <button
                                    onClick={() => startTargetGame(5)}
                                    disabled={generating || parsedTargetList.words.length === 0}
                                >
                                    {generating ? 'Generating…' : 'Target Trainer 5×5'}
                                </button>
                            </div>
                            {recommendedTargets.length > 0 && (
                                <div className="target-recommendations">
                                    <h3>Recommended additions</h3>
                                    <p className="word-trainer-setup-hint">
                                        Anagrams, reversals, one-letter insertions/replacements,
                                        and -s forms — top {recommendedTargets.length} by
                                        relevance.
                                    </p>
                                    <div className="target-recommendation-list">
                                        {recommendedTargets.map(({ word, score }) => (
                                            <button
                                                key={word}
                                                type="button"
                                                className="target-recommendation-chip"
                                                onClick={() => addRecommendedWord(word)}
                                                title={`Relevance ${score}`}
                                            >
                                                + {word.toLowerCase()}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
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
                            title={
                                gameMode === 'suffix' && boardSuffix
                                    ? `Words ending in -${boardSuffix.toLowerCase()}`
                                    : gameMode === 'double' && boardDoublePair
                                    ? `Words containing ${boardDoublePair.toLowerCase()}`
                                    : gameMode === 'target'
                                    ? 'Target words on board'
                                    : 'All Words (4+ letters)'
                            }
                            words={sortedAnswerWords}
                            foundSet={guessedSet}
                            showMissedStyle
                            extensionWordsSet={gameMode === 'suffix' ? suffixExtensionWordsSet : null}
                            frequentWords={frequentWords}
                            seedWord={gameMode === 'standard' ? boardSeedWord : null}
                            hoverWord={hoverWord}
                            onWordHover={handleWordHover}
                            onWordLeave={handleWordLeave}
                        />
                    )}
                </div>

                <div className="word-trainer-center">
                    <div className="word-trainer-stats">
                        {gameMode === 'suffix' && boardSuffix && (
                            <span className="word-trainer-suffix-label">
                                Suffix: <strong>-{boardSuffix.toLowerCase()}</strong>
                            </span>
                        )}
                        {gameMode === 'double' && boardDoublePair && (
                            <span className="word-trainer-suffix-label">
                                Double: <strong>{boardDoublePair.toLowerCase()}</strong>
                            </span>
                        )}
                        {gameMode === 'target' && (
                            <span className="word-trainer-suffix-label">
                                Targets: <strong>{boardTargetList.length}</strong> in list
                            </span>
                        )}
                        {gameMode === 'suffix' ? (
                            <span>
                                Words found: <strong>{suffixWordsFoundCount}</strong>
                                {showSuffixWordTotal && (
                                    <> / {maxSuffixWordCount}</>
                                )}
                            </span>
                        ) : gameMode === 'double' ? (
                            <span>
                                Words found: <strong>{doubleWordsFoundCount}</strong>
                                {showDoubleWordTotal && (
                                    <> / {maxDoubleWordCount}</>
                                )}
                            </span>
                        ) : gameMode === 'target' ? (
                            <span>
                                Targets found: <strong>{targetWordsFoundCount}</strong>
                                {showTargetWordTotal && (
                                    <> / {maxTargetWordCount}</>
                                )}
                            </span>
                        ) : (
                            <span>
                                Score: <strong>{currentScore.toLocaleString()}</strong> /{' '}
                                {maxScore.toLocaleString()}
                            </span>
                        )}
                    </div>

                    <div className="word-trainer-message-area">
                        {timeUpNotice && (
                            <p className="word-trainer-times-up">
                                Time&apos;s up!{' '}
                                {timeUpNotice.isSuffix
                                    ? `Words found: ${timeUpNotice.wordsFound}`
                                    : timeUpNotice.isDouble
                                    ? `Words found: ${timeUpNotice.doubleWordsFound}`
                                    : timeUpNotice.isTarget
                                    ? `Targets found: ${timeUpNotice.targetWordsFound}`
                                    : `Score: ${timeUpNotice.score.toLocaleString()}`}
                            </p>
                        )}
                        {!timeUpNotice && errorMessage && (
                            <p className="word-trainer-error">{errorMessage}</p>
                        )}
                    </div>

                    {(gameMode === 'suffix' || gameMode === 'double') && !givenUp && (
                        <label className="suffix-highlight-toggle">
                            <input
                                type="checkbox"
                                checked={suffixHighlightEnabled}
                                onChange={(e) => setSuffixHighlightEnabled(e.target.checked)}
                            />
                            {gameMode === 'suffix'
                                ? 'Highlight suffix on board'
                                : 'Highlight double letters on board'}
                        </label>
                    )}

                    <Board
                        board={board}
                        highlightPath={highlightPath}
                        highlightFading={highlightFading}
                        previewPath={givenUp ? hoverPath : null}
                        previewRevealProgress={givenUp ? hoverRevealProgress : 0}
                        suffixPath={
                            gameMode === 'suffix' || gameMode === 'double'
                                ? activeFeaturePath
                                : null
                        }
                        suffixHighlightEnabled={
                            suffixHighlightEnabled && !givenUp && !hoverWord
                        }
                        suffixHighlightFading={suffixHighlightFading}
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
                        {gameMode === 'suffix' ? (
                            <>
                                <button
                                    onClick={() => startSuffixGame(4, boardSuffix)}
                                    disabled={generating}
                                >
                                    New Suffix 4×4
                                </button>
                                <button
                                    onClick={() => startSuffixGame(5, boardSuffix)}
                                    disabled={generating}
                                >
                                    New Suffix 5×5
                                </button>
                            </>
                        ) : gameMode === 'double' ? (
                            <>
                                <button
                                    onClick={() => startDoubleGame(4, boardDoublePair)}
                                    disabled={generating}
                                >
                                    New Double 4×4
                                </button>
                                <button
                                    onClick={() => startDoubleGame(5, boardDoublePair)}
                                    disabled={generating}
                                >
                                    New Double 5×5
                                </button>
                            </>
                        ) : gameMode === 'target' ? (
                            <>
                                <button
                                    onClick={() => startTargetGame(4)}
                                    disabled={generating}
                                >
                                    New Target 4×4
                                </button>
                                <button
                                    onClick={() => startTargetGame(5)}
                                    disabled={generating}
                                >
                                    New Target 5×5
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => startNewGame(4)} disabled={generating}>
                                    New 4×4
                                </button>
                                <button onClick={() => startNewGame(5)} disabled={generating}>
                                    New 5×5
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="word-trainer-sidebar word-trainer-sidebar-right">
                    <WordList
                        title="Found Words"
                        words={sortedGuessedWords}
                        showFoundListStyle={isTrainerMode}
                        targetWordsSet={isTrainerMode ? targetWordsSet : null}
                    />
                </div>
            </div>
        </div>
    );
}

export default WordTrainer;
