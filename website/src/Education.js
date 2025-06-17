import React from 'react';
import './App.css';
import logo from './UCLALogo.jpg';

function Education() {
    return (
        <div className="education-container">
            <div className="education-item">
                <img src={logo} alt="" width="60"/>
                <div className="education-text">
                    <h3>M.S. Computer Science</h3>
                    <p>Expected June 2026</p>
                </div>
            </div>

            <div className="education-item">
                <img src={logo} alt="" width="60"/>
                <div className="education-text">
                    <h3>B.S. Computer Science</h3>
                    <p>June 2025 (Summa Cum Laude)</p>
                </div>
            </div>
        </div>
    );
}

export default Education;