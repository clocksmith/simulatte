const config = {
  appName: "DTF Tool Factory",
  version: "0.0.1",
  storePrefix: "_dtf_",
  stateKey: "dtf_state",
  sessionKey: "dtf_session",
  logMax: 500000,
  artifactMaxBytes: 4194304,
  model: "gemini-2.5-pro-exp-03-25",
  promptTemplateArtifactId: "prompt.tpl", // ID for fetching prompt from storage
  apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/models/",
  apiRetryDelay: 1500,
  apiMaxRetries: 2,
  apiMaxOutputTokens: 65536, // Max tokens for LLM response
  apiTemperature: 0.7, // Higher temp for more creativity
  apiTopP: 0.95, // Nucleus sampling
  // apiTopK: 40,          // Typically use Temp or TopP, not both + TopK
  apiMaxTurns: 1, // Max conversational turns (usually 1 for this app)
  apiSafetySettings: [
    "HATE_SPEECH",
    "HARASSMENT",
    "SEXUALLY_EXPLICIT",
    "DANGEROUS_CONTENT",
  ],
  runTimeoutMs: 6000, // Timeout for executing generated JS (1 min)
  storeQuotaBytes: 5242880, // 5MB local storage quota
  storeQuotaWarn: 0.9, // Warn at 90% quota usage
  continuousModeDefaultIterations: 10, // Default cycles for continuous mode
  manualModeVersions: 3, // Default versions to generate in manual mode
};

export default config;
