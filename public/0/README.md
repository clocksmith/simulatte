# Zero

## Overview

**Zero** is a single-page web application that provides a visual simulation exploring the mathematical concepts of **Zero**, **Reflection**, and **Identity**. It uses a simplified 1D quantum mechanics and special relativity simulation rendered with WebGL to represent these abstract ideas intuitively.

The simulation features a quantum wave packet whose properties (velocity, width/energy) and environment (potential barriers) can be manipulated by the user. The application dynamically provides context, linking the current simulation state and user actions back to the core mathematical principles.

## Key Features

- **WebGL Simulation:** A real-time visualization of a quantum wave packet in 1D space, rendered using WebGL shaders for visual effects.
- **Interactive Controls:** Manipulate the particle's velocity (approaching relativistic speeds), its width (related to energy/uncertainty), add/modify a potential barrier, apply parity flips, and toggle time evolution.
- **Concept Visualization:**
  - **Zero:** Represented by setting velocity to zero (rest frame), initializing at the origin, or considering the ground state/uncertainty principle.
  - **Reflection:** Visualized through interaction with the potential barrier and the Parity (P) transformation (mirroring across the origin).
  - **Identity:** Illustrated by the system's state at zero velocity, the effect of double parity flips (P² = I), and the unitary nature of time evolution.
- **Relativistic Hints:** Visual cues for Lorentz contraction (wave packet width changes with velocity).
- **Quantum Effects:** Basic wave packet behavior, reflection, and tunneling at the potential barrier.
- **Contextual Information:** Panels display the current simulation parameters and provide explanations linking the visuals to the target mathematical concepts.
- **Unity Link:** A unique feature where every user interaction triggers a conceptual calculation based on a physical invariant, represented as `X⁰ = 1`. This reinforces the idea of underlying constancy and updates the URL fragment identifier to `#1`.
- **Theme Toggle:** Switch between dark (default) and light display modes.
- **Self-Contained:** Runs entirely within a single `index.html` file with inline CSS and JavaScript. No external libraries are required.

## Technology Stack

- HTML5
- CSS3 (with CSS Variables for theming)
- Vanilla JavaScript (ES6+)
- WebGL (via native browser APIs)

## How to Run

1.  Save the code as an `index.html` file.
2.  Open the `index.html` file in a modern web browser that supports WebGL (e.g., Chrome, Firefox, Edge, Safari).

Interact with the controls on the right panel to manipulate the simulation and observe the visual output and contextual explanations.
