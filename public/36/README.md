# TPU (Tensor Processing Unit) Planning Utilizing TPU

## ❯❯ Overview

This project provides a 3D WebGL visualization and simulated performance metrics for a theoretical TPU (Tensor Processing Unit) or GPU cluster arranged on the surface of a twisted torus. It allows users to configure various parameters of the simulated hardware setup and observe the estimated impact on performance metrics like throughput, efficiency, latency, and cost.

Additionally, it incorporates a simple AI (using brain.js) that can be trained on the collected simulation data to predict performance for given configurations and recommend potentially optimal settings.

## ❯❯ Features

- **🌀 3D Torus Visualization:** Uses WebGL to render a configurable twisted torus representing the hardware layout. Individual TPUs are shown as small cuboids on the surface.
  - TPU color intensity and emission vary based on the simulated network efficiency, providing a visual cue for activity.
- **⚙️ Configurable Parameters:**
  - **Hardware:** Number of TPUs, Torus Major/Minor Radius, Torus Knot Twist, Tube Surface Twist, TPU Density, TPU Base Size.
  - **Compute:** Float Type (FP32, BF16, etc.), Quantization (None, Post-Training, QAT).
  - **Network:** Interconnect Type (Ethernet, Copper, Optical, Custom).
- **📊 Live Metrics & Graphs:**
  - Displays calculated estimates for Throughput (TFLOPS), Efficiency (%), Latency (ms), and a relative Cost Factor.
  - Shows simple historical line graphs for Throughput, Efficiency, and Latency.
- **🔴 Record & Export:**
  - Allows recording simulation metrics and configuration snapshots over a specified duration and rate.
  - Recorded data can be exported as a CSV file for external analysis.
- **🧠 AI Analysis & Control:**
  - Uses Brain.js (NeuralNetworkGPU) to train a simple feedforward neural network.
  - The AI learns the relationship between configuration parameters and performance metrics based on recorded simulation data.
  - **Prediction:** Estimates performance metrics for the _current_ configuration based on the trained model.
  - **Recommendation:** Searches through a random sample of possible configurations to find one predicted to yield the best "Throughput per Cost Factor" ratio.
  - **Visualization:** Displays a basic SVG representation of the AI network's structure (input, hidden, output layers).
  - Configurable AI parameters (hidden layers, activation function, learning rate, etc.).

## ❯❯ Controls

- **Reset:** Initializes or resets the simulation to the current configuration settings. Stops recording if active.
- **Play/Pause:** Toggles the live simulation updates and torus rotation.
- **Configuration Panel:** Sliders and dropdowns to adjust simulation parameters. Changes update metrics immediately.
- **Record & Export Panel:**
  - **Rate (Hz):** How many data points to record per second.
  - **Duration (s):** How long to record for.
  - **Record/Stop:** Starts or stops the recording process. Automatically stops after the specified duration. Recording only captures data while the simulation is _playing_.
  - **Export Run:** Exports the currently recorded data as a CSV file (enabled only after recording finishes or stops).
  - **Clear Data:** Discards the currently recorded data.
- **AI Analysis & Control Panel:**
  - **AI Configuration:** Adjust neural network structure, training parameters, and sampling sizes.
  - **Initialize AI:** Creates or re-creates the Brain.js network instance based on the current AI configuration. Must be done before training or finding recommendations.
  - **Train AI Now:** Trains the neural network using the currently collected simulation data (up to 'Max Samples'). Requires a minimum number of samples. The Control Panel will be disabled during training.
  - **Find Best Config (AI):** Uses the _currently trained_ AI model to search for a configuration predicted to yield the best throughput/cost ratio. Requires a minimum number of samples. The Control Panel will be disabled during the search.
  - **AI Status/Samples:** Shows the current AI state and the number of data points collected for potential training.
  - **AI Prediction:** Displays the AI's estimated performance for the _currently set_ configuration sliders.
  - **AI Recommendation:** Shows the configuration parameters and predicted metrics found by the 'Find Best Config' process.
  - **AI Network Visualization:** Basic SVG showing the layers of the initialized neural network.

## ❯❯ How Metrics Are Calculated (Simulated)

The performance metrics are _estimates_ based on the configuration parameters. They are designed to show _relative_ effects rather than precise real-world values.

- **Throughput (TFLOPS):**
  - Starts with a base FLOPs per TPU.
  - Scaled by `Float Type` (lower precision = higher potential FLOPs).
  - Scaled by `Quantization` (provides a small boost).
  - Scaled by `Interconnect` speed.
  - Slightly affected by `Torus Knot Twist`.
  - Reduced by a scaling efficiency factor that decreases logarithmically with the `Number of TPUs`.
  - A small random variation is added.
- **Efficiency (%):**
  - Starts with a base efficiency (e.g., 95%).
  - Scaled by `Interconnect` speed.
  - Reduced by the scaling efficiency factor (same as throughput).
  - Slightly reduced by `Torus Knot Twist`.
  - Clamped between 50% and 98%.
  - A small random variation is added.
- **Latency (ms):**
  - Starts with a base latency.
  - Increases logarithmically with the `Number of TPUs`.
  - Decreases with better `Interconnect` speeds.
  - Slightly reduced by `Torus Knot Twist`.
  - Clamped to a minimum value.
  - A small random variation is added.
- **Cost Factor:**
  - Primarily driven by the `Number of TPUs`.
  - Increased moderately by better `Interconnect` types.
  - Slightly adjusted by `Float Type` (lower precision = lower cost).
  - A small random variation is added.

## ❯❯ Technology

- **WebGL:** For 3D rendering of the torus and TPUs.
- **JavaScript:** For simulation logic, UI control, metric calculations, and AI interaction.
- **Brain.js (GPU accelerated):** For the neural network implementation used in the AI analysis section.
- **HTML/CSS:** For the user interface structure and styling.
- **SVG:** For visualizing the AI network structure.

## ❯❯ Running

Simply open the `index.html` file in a modern web browser that supports WebGL (Chrome, Firefox, Edge, Safari). No server is required.

## ❯❯ Notes

- The simulation metrics are abstract estimations and do not represent any specific real-world hardware accurately. They are intended for demonstrating the _relative_ impact of configuration choices.
- The AI model is very simple and its accuracy depends heavily on the amount and variety of data collected during simulation runs.
- The "Find Best Config" feature performs a random search guided by the AI's predictions and may not find the absolute global optimum. Running it multiple times or training with more diverse data can yield different results.
- WebGL performance can vary significantly depending on the browser, operating system, and graphics hardware.
