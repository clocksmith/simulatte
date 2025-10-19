/**
 * Time Manager
 * Handles game time progression
 */

export class TimeManager {
  constructor({ store }) {
    this.store = store;
    this.timeScale = 60; // 1 real second = 60 game seconds = 1 game minute
  }

  async initialize() {
    console.log('[TimeManager] Initialized');
  }

  update(dt) {
    // Advance time based on game speed
    const state = this.store.getState();
    const deltaHours = (dt * this.timeScale * state.game.speed) / 3600;

    this.store.dispatch({
      type: 'time:advance',
      payload: { delta: deltaHours }
    });
  }

  getTimeOfDay() {
    const state = this.store.getState();
    const hour = state.time.hour;

    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 20) return 'evening';
    return 'night';
  }

  getDaylight() {
    // Return 0-1 brightness based on time of day
    const state = this.store.getState();
    const hour = state.time.hour;

    // Sunrise at 6am, sunset at 8pm
    if (hour >= 6 && hour <= 20) {
      // Day time
      if (hour >= 12 && hour <= 15) return 1.0; // Peak brightness
      if (hour < 12) {
        // Morning: gradually brighten
        return 0.3 + ((hour - 6) / 6) * 0.7;
      } else {
        // Evening: gradually darken
        return 1.0 - ((hour - 15) / 5) * 0.7;
      }
    } else {
      // Night time
      return 0.3;
    }
  }
}
