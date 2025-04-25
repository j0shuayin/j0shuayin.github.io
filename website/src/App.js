import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';

import Education from './Education.js';

function App() {
  return (
    <Router>
      <div className="app-container">
        <header>
          <nav>
            <Link to="/">Home</Link> | <Link to="/education">Education</Link>
          </nav>
        </header>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/education" element={<Education />}/>
        </Routes>
      </div>

    </Router>
  );
}

function Home() {
  return (
    <div className="Home">
      <p>
        Joshua Yin
      </p>
          Aspiring software engineer interested in cloud and AI/ML.
    </div>
  );
}

export default App;
