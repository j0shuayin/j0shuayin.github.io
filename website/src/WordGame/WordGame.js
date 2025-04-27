import React, { useState, useEffect } from 'react';
import './WordGame.css';
import words_easy from './words_easy.txt';
import words_hard from './words_hard.txt';

function WordGame() {
    const [letters, setLetters] = useState([]);
    const [inGame, setInGame] = useState(false);
    const [textValue, setTextValue] = useState('');
    const [score, setScore] = useState(0);

    const handleNewGame = () => {
        setLetters(generateLetters(4, 3)); // 4 rows, 3 letters each
        setInGame(true);
        setTextValue('');
        setScore(0);
    };

    return (
        <div className="game">
            {!inGame ? (
                <button onClick={handleNewGame}>New Game</button>
            ) : ( 
                <>
                    <div className="score">Score: {score}</div>
                    {letters.map((row, index) => (
                        <div key={index}>{row}</div>
                    ))}
                    <GameTextBox 
                        letters={letters}
                        value={textValue} 
                        setValue={setTextValue} 
                        score={score}
                        setScore={setScore}
                    />
                    <button onClick={handleNewGame}>New Game</button>
                </>
            )}
        </div>
    );
}

function GameTextBox({ letters, value, setValue, score, setScore }) {
    const [wordList, setWordList] = useState(new Set());

    useEffect(() => {
        fetch(words_hard)
            .then(r => r.text())
            .then(text => {
                const words = text.split('\n');
                setWordList(new Set(words));
            })
    }, []);

    const handleChange = (event) => {
        const inputValue = event.target.value;
        let newChar = inputValue.slice(-1).toUpperCase();
        let prevChar = inputValue.slice(-2, -1).toUpperCase();
        let isValidLetter = letters.join('').includes(newChar);
        let letterRow = '';
        for (let i = 0; i < letters.length; i++) {
            if (letters[i].includes(prevChar)) {
                letterRow = letters[i];
                break;
            }
        }
        
        if (inputValue.length > value.length) {
            if (isValidLetter && (value.length === 0 || !letterRow.includes(newChar))) {
                setValue(inputValue.replace(/[^a-zA-Z]/g, '').toUpperCase());
            } else {
                setValue(value);
            }
        } else {
            setValue(inputValue.replace(/[^a-zA-Z]/g, '').toUpperCase());
        }
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            if (value.length < 3) alert("you must enter at least 3 letters!");
            else if (wordList.has(value)) {
                setScore(score+1);
            } else {
                alert("invalid word!");
            }
            setValue('');
        }
    };

    return (
        <div>
            <input 
                type="text" 
                value={value} 
                onChange={handleChange} 
                onKeyDown={handleKeyDown} 
            />
        </div>
    );
}

function generateLetters(numRows, numLetters) {
    if (numLetters < 0 || numLetters > 26) return [];

    let shuffledVowels = 'AEIOU'.split('').sort(() => Math.random() - 0.5).join('');
    let shuffledConsonants = 'BCDFGHJKLMNPQRSTVWXYZ'.split('').sort(() => Math.random() - 0.5).join('');

    let numVowels = 2 + Math.floor(Math.random() * 4); //guarantee at least 2 vowels
    let shuf = shuffledVowels.slice(0, numVowels)
        .concat(shuffledConsonants.slice(0, numRows * numLetters - numVowels))
        .split('').sort(() => Math.random() - 0.5).join('');
    
    let letters = [];
    for (let i = 0; i < numRows; i++) {
        letters.push(shuf.slice(i * numLetters, (i + 1) * numLetters));
    }
    return letters;
}

export default WordGame;