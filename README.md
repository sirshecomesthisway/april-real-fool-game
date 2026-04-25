# April Real / Fool - Kahoot-style Firebase bundle

This bundle is static HTML/CSS/JS and runs on Firebase Realtime Database plus any static host such as Vercel.

## Files
- `index.html` - player page
- `host.html` - host page
- `firebase-config.js` - paste your Firebase web app config here
- `questions.js` - all questions, answers, artifact notes, and source links
- `common.js` - shared Firebase helpers, timer, sounds, and rendering helpers
- `player.js` - player UI logic
- `host.js` - host controls and scoring logic
- `style.css` - Kahoot-style UI

## Setup
1. Open `firebase-config.js`
2. Replace every `REPLACE` value with your Firebase config
3. In Firebase Realtime Database rules, allow reads and writes for the game window
4. Upload these files to your repo root and deploy on Vercel

## URLs
- Host: `/host.html`
- Players: `/index.html`

## Game flow
1. Players open `/index.html`, enter their names, and wait in the lobby
2. Host opens `/host.html`
3. Host clicks `Start Game` to open question 1 in waiting mode
4. Host clicks `Start Timer` to start the 15-second round
5. Players can change answers until time hits zero
6. The game auto-reveals the correct answer, artifact note, and source links
7. Host clicks `Next Question` to move on
8. Host clicks `Show Podium` at the end

## Scoring
- First correct answer: 5 points
- Second and third correct answers: 3 points each
- All other correct answers: 1 point each

Rank is based on the final answer timestamp stored in Firebase.
