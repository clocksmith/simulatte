export const MathUtils = {
  softmax(logits) {
    // Handle large arrays without stack overflow (avoid spread operator)
    let maxLogit = -Infinity;
    for (let i = 0; i < logits.length; i++) {
      if (logits[i] > maxLogit) maxLogit = logits[i];
    }

    const exps = new Float32Array(logits.length);
    let sumExps = 0;
    for (let i = 0; i < logits.length; i++) {
      exps[i] = Math.exp(logits[i] - maxLogit);
      sumExps += exps[i];
    }

    const result = new Float32Array(logits.length);
    for (let i = 0; i < logits.length; i++) {
      result[i] = exps[i] / sumExps;
    }
    return result;
  },

  calculateEntropy(probs) {
    return -probs.reduce((sum, p) => {
      return p > 0 ? sum + (p * Math.log(p)) : sum;
    }, 0);
  },

  argmax(array) {
    return array.reduce((iMax, x, i, arr) => x > arr[iMax] ? i : iMax, 0);
  },

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
};