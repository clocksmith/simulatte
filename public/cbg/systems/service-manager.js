/**
 * Service Manager
 * Manages park services (lighting, security, maintenance, programs)
 */

export class ServiceManager {
  constructor({ store }) {
    this.store = store;
  }

  async initialize() {
    console.log('[ServiceManager] Initialized');
  }

  update(dt) {
    const state = this.store.getState();

    // Calculate service coverage based on buildings
    const buildings = Object.values(state.buildings);

    // Count service buildings
    const lightingCount = buildings.filter(b => b.type === 'lighting').length;
    const securityCount = buildings.filter(b => b.type === 'security').length;
    const maintenanceCount = buildings.filter(b => b.type === 'maintenance').length;
    const programsCount = buildings.filter(b => b.type === 'programs').length;

    // Calculate coverage (each building covers a certain area)
    const coveragePerBuilding = 10; // Arbitrary coverage units

    const lightingCoverage = Math.min(100, lightingCount * coveragePerBuilding);
    const securityCoverage = Math.min(100, securityCount * coveragePerBuilding);
    const maintenanceCoverage = Math.min(100, maintenanceCount * coveragePerBuilding);
    const programsCoverage = Math.min(100, programsCount * coveragePerBuilding);

    // Update services
    this.store.dispatch({
      type: 'services:update',
      payload: {
        service: 'lighting',
        updates: { coverage: lightingCoverage }
      }
    });

    this.store.dispatch({
      type: 'services:update',
      payload: {
        service: 'security',
        updates: { coverage: securityCoverage }
      }
    });

    this.store.dispatch({
      type: 'services:update',
      payload: {
        service: 'maintenance',
        updates: { coverage: maintenanceCoverage }
      }
    });

    this.store.dispatch({
      type: 'services:update',
      payload: {
        service: 'programs',
        updates: { coverage: programsCoverage }
      }
    });
  }

  getServiceLevel(serviceType) {
    const state = this.store.getState();
    return state.services[serviceType]?.coverage || 0;
  }
}
