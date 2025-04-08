# Double Pendulum Simulator

An interactive web-based simulator for exploring the chaotic dynamics of a double pendulum system using the 4th-Order Runge-Kutta (RK4) numerical integration method.

![Screenshot](screenshot.png)
_(TODO: Add a screenshot.png to the repository for a visual preview)_

## Features

- **Physics Simulation:** Accurately simulates the motion of a double pendulum using RK4 integration.
- **Interactive Canvas:**
  - Visualizes the pendulum's movement in real-time.
  - Allows dragging the bobs to set initial conditions when paused.
  - Displays traces of the bob paths.
  - Visualizes optional damping forces and magnetic fields.
- **Configurable Parameters:**
  - Initial angles (θ₁, θ₂) for both default reset and current state.
  - Bob masses (m₁, m₂).
  - Rod lengths (L₁, L₂).
  - Gravitational acceleration (g).
  - Damping coefficients for each bob.
- **Optional External Forces:**
  - Uniform wind force (magnitude and direction).
  - Simplified Lorentz force based on bob charges (q₁, q₂) and a uniform perpendicular magnetic field (Bz).
- **Detailed Visualizations:**
  - Real-time display of bob angles.
  - Numerical display of angular velocities (ω₁, ω₂).
  - Breakdown of Kinetic (KE), Potential (PE), and Total Energy (E) for the system and individual bobs.
  - Chaos metric (relative standard deviation of total energy).
  - History plots for angular velocities, energies (Total, KE, PE, individual), and the chaos metric.
- **Data Recording & Export:**
  - Record simulation state variables (time, angles, velocities, positions, energies) over time.
  - Configurable maximum recording duration with estimated file size.
  - Two recording modes:
    - **Live:** Records data while the simulation runs and renders normally.
    - **Fast CSV:** Runs the simulation without rendering at maximum speed to generate data quickly (UI unresponsive during generation).
  - Download recorded data as a CSV file for offline analysis.
- **User Interface:**
  - Collapsible sections for visualizations, simulation, controls, and equations.
  - Tooltips explaining each parameter and control.
  - Dark mode toggle (syncs with system preference by default).
  - Adjustable physics update rate and canvas render rate.
- **Equations Display:** Presents the core Lagrangian, equations of motion, energy calculations, and RK4 method using LaTeX (rendered via KaTeX).

## How to Use

1.  Clone or download this repository.
2.  Open the `index.html` file in a modern web browser (like Chrome, Firefox, Edge, Safari).
3.  Adjust parameters in the "Controls & Parameters" section.
4.  Use the "Start", "Stop", and "Reset" buttons to control the simulation.
5.  When paused, click and drag the pendulum bobs on the canvas to set new starting angles.
6.  Configure data recording options and use the "Download Recorded Data (CSV)" button to export simulation results.
7.  Click the headers of the cards (Visualizations, Simulation Canvas, etc.) to collapse or expand them.
8.  Use the "Toggle Theme" button in the top right to switch between light and dark modes.

## Technologies Used

- HTML5
- CSS3 (including CSS Variables for theming)
- JavaScript (ES6+)
- HTML5 Canvas API for rendering
- [KaTeX](https://katex.org/) for rendering LaTeX equations

## Equations

The simulator utilizes the Lagrangian formulation to derive the equations of motion for the double pendulum. Key equations, including the Lagrangian, equations of motion, energy calculations, and the RK4 integration steps, are displayed within the "Equations Used" card on the web page.
