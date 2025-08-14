import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './WordGame.css';
import words_hard from './words_hard.txt';

// --- Helper Functions ---

function generateLetters(numSides, lettersPerSide) {
    const totalLetters = numSides * lettersPerSide;
    if (totalLetters <= 0 || totalLetters > 26) return [];

    const vowels = 'AEIOU'.split('');
    const consonants = 'BCDFGHJKLMNPQRSTVWXYZ'.split('');

    let guaranteedVowels = [];
    while (guaranteedVowels.length < 2 && vowels.length > 0) {
        const randIndex = Math.floor(Math.random() * vowels.length);
        guaranteedVowels.push(vowels.splice(randIndex, 1)[0]);
    }
    
    const remainingLettersCount = totalLetters - guaranteedVowels.length;
    const remainingChars = [...vowels, ...consonants].sort(() => 0.5 - Math.random());
    
    const allChars = [...guaranteedVowels, ...remainingChars.slice(0, remainingLettersCount)]
        .sort(() => 0.5 - Math.random());

    const result = [];
    for (let i = 0; i < numSides; i++) {
        result.push(allChars.slice(i * lettersPerSide, (i + 1) * lettersPerSide));
    }
    return result;
}

function getLetterStyle(sideIndex, letterIndex, numSides, lettersPerSide) {
    const boxSize = 280;
    const radius = boxSize / 2;
    const angleStep = (2 * Math.PI) / numSides;
    
    const letterRadius = radius + 25;
    const rotationOffset = numSides === 4 ? Math.PI / 4 : 0;

    const getVertex = (index) => {
        const angle = angleStep * index - Math.PI / 2 + rotationOffset;
        return {
            x: letterRadius * Math.cos(angle) + radius,
            y: letterRadius * Math.sin(angle) + radius,
        };
    };

    const startVertex = getVertex(sideIndex);
    const endVertex = getVertex((sideIndex + 1) % numSides);
    
    const ratio = (letterIndex + 1) / (lettersPerSide + 1);
    const x = startVertex.x + (endVertex.x - startVertex.x) * ratio;
    const y = startVertex.y + (endVertex.y - startVertex.y) * ratio;

    return {
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -50%)',
    };
}


// --- React Components ---

function Polygon({ numSides }) {
    const size = 280;
    const radius = size / 2;

    const points = useMemo(() => {
        const rotationOffset = numSides === 4 ? Math.PI / 4 : 0;

        return Array.from({ length: numSides }).map((_, i) => {
            const angle = (i * 2 * Math.PI / numSides) - Math.PI / 2 + rotationOffset;
            const x = radius * Math.cos(angle) + radius;
            const y = radius * Math.sin(angle) + radius;
            return `${x},${y}`;
        }).join(' ');
    }, [numSides, radius]);

    return (
        <svg className="polygon-svg" width={size} height={size}>
            <polygon points={points} />
        </svg>
    );
}

function LetterBox({ letters, currentWord, usedLetters }) {
    const numSides = letters.length;
    if (numSides === 0) return null;
    const lettersPerSide = letters[0].length;
    const lastChar = currentWord.slice(-1);

    return (
        <div className="letter-box-container">
            <Polygon numSides={numSides} />
            {letters.map((side, sideIndex) =>
                side.map((letter, letterIndex) => {
                    const style = getLetterStyle(sideIndex, letterIndex, numSides, lettersPerSide);
                    const isLast = letter === lastChar && currentWord.length > 0;
                    const isInCurrent = currentWord.includes(letter);
                    const isUsed = usedLetters.has(letter);

                    const className = `letter
                        ${isLast ? 'green' : ''}
                        ${!isLast && isInCurrent ? 'orange' : ''}
                        ${isUsed ? 'gray' : ''}
                    `;
                    
                    return (
                        <div key={`${sideIndex}-${letterIndex}`} className={className} style={style}>
                            {letter}
                        </div>
                    );
                })
            )}
        </div>
    );
}

function GuessedWords({ words }) {
    return (
        <div className="guessed-words-container">
            <h3>Guessed Words:</h3>
            <div className="guessed-words-list">
                {words.map((word, index) => (
                    <span key={index} className="guessed-word">{word}</span>
                ))}
            </div>
        </div>
    );
}

function WordGame() {
    const [inGame, setInGame] = useState(false);
    const [wordList, setWordList] = useState(new Set());
    const [numSides, setNumSides] = useState(4);
    const [lettersPerSide, setLettersPerSide] = useState(3);
    const [letters, setLetters] = useState([]);
    const [currentWord, setCurrentWord] = useState('');
    const [guessedWords, setGuessedWords] = useState([]);
    const [usedLetters, setUsedLetters] = useState(new Set());
    const [gameWon, setGameWon] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const allBoardLetters = useMemo(() => new Set(letters.flat()), [letters]);

    useEffect(() => {
        fetch(words_hard)
            .then(r => r.text())
            .then(text => setWordList(new Set(text.toUpperCase().split('\n'))));
    }, []);

    useEffect(() => {
        if (errorMessage) {
            const timer = setTimeout(() => {
                setErrorMessage('');
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [errorMessage]);

    useEffect(() => {
        const newUsedLetters = new Set(guessedWords.join(''));
        setUsedLetters(newUsedLetters);
        
        if (allBoardLetters.size > 0 && newUsedLetters.size === allBoardLetters.size) {
            setGameWon(true);
        }
    }, [guessedWords, allBoardLetters]);
    
    const handleNewGame = () => {
        setLetters(generateLetters(numSides, lettersPerSide));
        setInGame(true);
        setCurrentWord('');
        setGuessedWords([]);
        setUsedLetters(new Set());
        setGameWon(false);
        setErrorMessage('');
    };

    const findLetterSide = useCallback((letter) => {
        return letters.findIndex(side => side.includes(letter));
    }, [letters]);

    const handleInputChange = (e) => {
        // Clear error message as soon as user starts typing
        if (errorMessage) setErrorMessage('');

        let newValue = e.target.value.toUpperCase();

        if (guessedWords.length > 0 && newValue.length > 0 && newValue[0] !== currentWord[0]) {
             newValue = currentWord[0] + newValue.substring(1);
        }

        if (newValue.length < currentWord.length) {
            setCurrentWord(newValue);
            return;
        }

        const newChar = newValue.slice(-1);
        const prevChar = currentWord.slice(-1);

        if (!allBoardLetters.has(newChar)) return;

        if (prevChar) {
            const prevSide = findLetterSide(prevChar);
            const newSide = findLetterSide(newChar);
            if (prevSide === newSide) return;
        }

        setCurrentWord(newValue);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            
            if (currentWord.length < 3) {
                setErrorMessage("Word must be at least 3 letters long!");
                return;
            }
            if (!wordList.has(currentWord)) {
                setErrorMessage("Not a valid word!");
                return;
            }
            if (guessedWords.includes(currentWord)) {
                setErrorMessage("You've already guessed that word!");
                return;
            }
            if (guessedWords.length > 0 && currentWord[0] !== guessedWords[guessedWords.length - 1].slice(-1)) {
                setErrorMessage(`Word must start with "${guessedWords[guessedWords.length - 1].slice(-1)}"!`);
                return;
            }

            // On success, clear any existing error messages
            setErrorMessage('');
            setGuessedWords([...guessedWords, currentWord]);
            setCurrentWord(currentWord.slice(-1));
        }

        if (e.key === 'Backspace' && currentWord.length <= 1 && guessedWords.length > 0) {
            e.preventDefault();
            const lastWord = guessedWords[guessedWords.length - 1];
            setGuessedWords(guessedWords.slice(0, -1));
            setCurrentWord(lastWord);
        }
    };

    if (!inGame) {
        return (
            <div className="game-setup">
                <h1>Word Game</h1>
                <div className="slider-container">
                    <label>Sides: {numSides}</label>
                    <input type="range" min="3" max="6" value={numSides} onChange={(e) => setNumSides(Number(e.target.value))} />
                </div>
                 <div className="slider-container">
                    <label>Letters per Side: {lettersPerSide}</label>
                    <input type="range" min="3" max="4" value={lettersPerSide} onChange={(e) => setLettersPerSide(Number(e.target.value))} />
                </div>
                <button onClick={handleNewGame}>New Game</button>
            </div>
        );
    }

    return (
        <div className="game">
            {gameWon ? (
                <div className="win-message">
                    <h2>🎉 You Win! 🎉</h2>
                    <p>You used all {allBoardLetters.size} letters in {guessedWords.length} words.</p>
                </div>
            ) : (
                <>
                    <div className="message-area">
                        {errorMessage && <p className="error-message">{errorMessage}</p>}
                    </div>
                    <LetterBox letters={letters} currentWord={currentWord} usedLetters={usedLetters} />
                    <input 
                        type="text"
                        className="word-input"
                        value={currentWord}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Type word..."
                        autoFocus
                    />
                </>
            )}
             <GuessedWords words={guessedWords} />
            <button onClick={handleNewGame}>New Game</button>
        </div>
    );
}

export default WordGame;