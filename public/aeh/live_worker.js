'use strict';

const RANKS = 'AKQJT98765432'.split('');
const SUITS = ['s', 'h', 'd', 'c'];
const RANK_VALUES = '23456789TJQKA';

function createDeck() {
  const deck = [];
  SUITS.forEach((suit) => {
    RANKS.forEach((rank) => {
      deck.push(rank + suit);
    });
  });
  return deck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function evaluateHand(sevenCards) {
  const cardRanks = sevenCards
    .map((c) => RANK_VALUES.indexOf(c[0]))
    .sort((a, b) => b - a);
  const cardSuits = sevenCards.map((c) => c[1]);
  const rankCounts = cardRanks.reduce(
    (acc, r) => ((acc[r] = (acc[r] || 0) + 1), acc),
    {}
  );
  const suitCounts = cardSuits.reduce(
    (acc, s) => ((acc[s] = (acc[s] || 0) + 1), acc),
    {}
  );
  const isFlush = Object.values(suitCounts).some((c) => c >= 5);
  const flushSuit = isFlush
    ? Object.keys(suitCounts).find((s) => suitCounts[s] >= 5)
    : null;
  const flushRanks = isFlush
    ? sevenCards
        .filter((c) => c[1] === flushSuit)
        .map((c) => RANK_VALUES.indexOf(c[0]))
        .sort((a, b) => b - a)
    : [];
  const uniqueRanks = [...new Set(cardRanks)];
  let isStraight = false;
  let straightHighRank = -1;
  if ([12, 3, 2, 1, 0].every((r) => uniqueRanks.includes(r))) {
    isStraight = true;
    straightHighRank = 3;
  } else {
    for (let i = 0; i <= uniqueRanks.length - 5; i++) {
      if (uniqueRanks[i] - uniqueRanks[i + 4] === 4) {
        isStraight = true;
        straightHighRank = uniqueRanks[i];
        break;
      }
    }
  }
  let isStraightFlush = false;
  let sfHighRank = -1;
  if (isFlush) {
    const uniqueFlushRanks = [...new Set(flushRanks)];
    if ([12, 3, 2, 1, 0].every((r) => uniqueFlushRanks.includes(r))) {
      isStraightFlush = true;
      sfHighRank = 3;
    } else {
      for (let i = 0; i <= uniqueFlushRanks.length - 5; i++) {
        if (uniqueFlushRanks[i] - uniqueFlushRanks[i + 4] === 4) {
          isStraightFlush = true;
          sfHighRank = uniqueFlushRanks[i];
          break;
        }
      }
    }
  }
  if (isStraightFlush) return [8, sfHighRank];
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const rankKeys = Object.keys(rankCounts)
    .sort((a, b) => rankCounts[b] - rankCounts[a] || b - a)
    .map(Number);
  if (counts[0] === 4) return [7, rankKeys[0], rankKeys[1]];
  if (counts[0] === 3 && counts[1] >= 2)
    return [6, rankKeys[0], rankKeys[1]];
  if (isFlush) return [5, ...flushRanks.slice(0, 5)];
  if (isStraight) return [4, straightHighRank];
  if (counts[0] === 3) return [3, rankKeys[0], ...rankKeys.slice(1, 3)];
  if (counts[0] === 2 && counts[1] === 2)
    return [2, rankKeys[0], rankKeys[1], rankKeys[2]];
  if (counts[0] === 2) return [1, rankKeys[0], ...rankKeys.slice(1, 4)];
  return [0, ...cardRanks.slice(0, 5)];
}

function compareScores(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

self.onmessage = function (event) {
  const { heroHand, opponentHands, boardCards, iterations } = event.data;
  const usedCards = new Set([
    ...heroHand,
    ...opponentHands.flat(),
    ...boardCards,
  ]);
  const remainingDeckTemplate = createDeck().filter(
    (card) => !usedCards.has(card)
  );
  const cardsToDeal = 5 - boardCards.length;
  const opponentCount = opponentHands.length;
  const handDistribution = new Array(9).fill(0);
  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < iterations; i++) {
    const deck = remainingDeckTemplate.slice();
    shuffleDeck(deck);
    const runningBoard = boardCards.concat(deck.slice(0, cardsToDeal));
    const heroScore = evaluateHand(heroHand.concat(runningBoard));
    const opponentScores = opponentHands.map((hand) =>
      evaluateHand(hand.concat(runningBoard))
    );
    let bestScore = heroScore;
    opponentScores.forEach((score) => {
      if (compareScores(score, bestScore) > 0) bestScore = score;
    });
    const heroComparison = compareScores(heroScore, bestScore);
    let share = 0;
    if (heroComparison > 0) {
      // Hero wins outright
      share = 1;
    } else if (heroComparison === 0) {
      // Hero ties for best hand
      let tieCount = 0;
      opponentScores.forEach((score) => {
        if (compareScores(score, bestScore) === 0) tieCount++;
      });
      share = 1 / (tieCount + 1);
    }
    // If heroComparison < 0, hero loses and share remains 0
    handDistribution[heroScore[0]]++;
    sum += share;
    sumSq += share * share;
    if ((i + 1) % 500 === 0) {
      self.postMessage({
        type: 'progress',
        progress: (i + 1) / iterations,
      });
    }
  }

  const mean = sum / iterations;
  const variance = Math.max(0, sumSq / iterations - mean * mean);
  const stderr = Math.sqrt(variance / iterations);

  self.postMessage({
    type: 'complete',
    payload: {
      equity: mean * 100,
      stderr: stderr * 100,
      samples: iterations,
      handDistribution,
    },
  });
};
