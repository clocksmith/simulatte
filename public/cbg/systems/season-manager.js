/**
 * Season Manager
 * Handles seasonal transitions and effects
 */

export class SeasonManager {
  constructor({ store }) {
    this.store = store;
    this.dayCounter = 0;
    this.daysPerSeason = 30; // Each season lasts 30 game days
  }

  async initialize() {
    console.log('[SeasonManager] Initialized');
  }

  update(dt) {
    const state = this.store.getState();
    const currentMonth = state.time.month;

    // Determine season based on month
    const season = this.getSeasonFromMonth(currentMonth);

    if (season !== state.season.current) {
      this.transitionToSeason(season, currentMonth);
    }

    // Update temperature based on season and time of day
    const temperature = this.calculateTemperature(season, state.time.hour);

    this.store.dispatch({
      type: 'season:update',
      payload: {
        current: season,
        temperature
      }
    });
  }

  getSeasonFromMonth(month) {
    // March-May = Spring
    // June-August = Summer
    // September-November = Fall
    // December-February = Winter
    if (month >= 3 && month <= 5) return 'Spring';
    if (month >= 6 && month <= 8) return 'Summer';
    if (month >= 9 && month <= 11) return 'Fall';
    return 'Winter';
  }

  transitionToSeason(season, month) {
    console.log(`[SeasonManager] Transitioning to ${season}`);

    // Clear some entities that are season-specific
    const state = this.store.getState();
    const entitiesToRemove = state.entities.filter(e => {
      // Remove winter-only activities in other seasons, etc.
      if (season === 'Winter' && e.activity === 'outdoor-dj') return true;
      if (season === 'Winter' && e.activity === 'picnic') return true;
      return false;
    });

    entitiesToRemove.forEach(e => {
      this.store.dispatch({
        type: 'entity:remove',
        payload: { entityId: e.id }
      });
    });

    // Update season state
    this.store.dispatch({
      type: 'season:update',
      payload: {
        current: season,
        day: 1
      }
    });
  }

  calculateTemperature(season, hour) {
    // Base temperatures by season (Fahrenheit)
    const baseTemps = {
      Spring: 60,
      Summer: 80,
      Fall: 55,
      Winter: 35
    };

    const baseTemp = baseTemps[season] || 60;

    // Vary by time of day
    // Coldest at 6am, warmest at 3pm
    const hourFactor = Math.sin((hour - 6) * Math.PI / 12) * 10;

    return Math.round(baseTemp + hourFactor);
  }

  getCurrentSeason() {
    return this.store.getState().season.current;
  }
}
