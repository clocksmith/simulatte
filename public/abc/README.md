# ABC - Alphabet Smash

A toddler-friendly alphabet game with speech recognition. Mash the keyboard or speak letters to see them come alive!

## Features

- **Keyboard Input:** Press any letter or number key to display it with colorful animations
- **Speech Recognition:** Say letters out loud using on-device Whisper AI (no server required)
- **ABC Song Tempo:** Letters are played and displayed with proper ABC song timing
- **Visual Effects:** Particles, floating shapes, rainbow mouse trails, and scrolling marquee
- **Touch Friendly:** Works great on tablets and touchscreens

## Usage

1. Open `index.html` in a modern browser
2. Select a voice recognition model (or "Off" for keyboard-only)
3. Tap anywhere to start
4. Press keys or speak letters!

## Voice Models

- **Off:** No speech recognition
- **Tiny:** Fastest, ~40MB download
- **Base:** Balanced speed/accuracy, ~75MB
- **Small:** Most accurate, ~250MB

## Technologies

- Vanilla JavaScript (ES Modules)
- Web Audio API for sound generation
- Transformers.js for on-device Whisper speech recognition
- WebGPU acceleration when available
