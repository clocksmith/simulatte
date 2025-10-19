/**
 * CBG State Store
 * Centralized state management with reducer pattern
 */

export function createStore() {
  let state = getInitialState();
  const listeners = new Set();

  function getInitialState() {
    return {
      game: {
        initialized: false,
        paused: false,
        speed: 1, // 1x, 2x, 4x
        tick: 0
      },
      map: {
        name: '',
        width: 0,
        height: 0,
        tiles: [],
        metadata: {}
      },
      camera: {
        x: 0,
        y: 0,
        zoom: 1.0,
        rotation: 0 // For isometric, this will be fixed
      },
      resources: {
        budget: 50000,
        income: 0,
        expenses: 0
      },
      time: {
        hour: 12.0, // 0-24, decimal for smooth time
        day: 1,
        month: 6, // Start in June (summer)
        year: 2025
      },
      season: {
        current: 'Summer', // Spring, Summer, Fall, Winter
        day: 1,
        temperature: 75 // Fahrenheit
      },
      zones: {
        // Maps zone ID to zone data
      },
      buildings: {
        // Maps building ID to building data
      },
      entities: [],
      services: {
        lighting: {
          coverage: 0,
          cost: 100
        },
        security: {
          coverage: 0,
          cost: 200
        },
        maintenance: {
          coverage: 0,
          cost: 150
        },
        programs: {
          coverage: 0,
          cost: 250
        }
      },
      ui: {
        selectedTool: 'inspect',
        selectedTile: null,
        hoveredTile: null,
        preview: {
          tiles: [],
          tool: null
        }
      },
      stats: {
        visitorCount: 0,
        happiness: 0,
        cleanliness: 100,
        safety: 100
      }
    };
  }

  function getState() {
    return state;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function dispatch(action) {
    console.log('[Store] Dispatch:', action.type, action.payload);

    const prevState = state;
    state = reducer(state, action);

    if (prevState !== state) {
      listeners.forEach(listener => {
        try {
          listener(state, action);
        } catch (error) {
          console.error('[Store] Listener error:', error);
        }
      });
    }

    return state;
  }

  function reducer(state, action) {
    switch (action.type) {
      // Game actions
      case 'game:new':
        return {
          ...getInitialState(),
          map: action.payload.mapData,
          game: { ...getInitialState().game, initialized: true }
        };

      case 'game:load':
        return {
          ...state,
          ...action.payload,
          game: { ...state.game, initialized: true }
        };

      case 'game:toggle-pause':
        return {
          ...state,
          game: { ...state.game, paused: !state.game.paused }
        };

      case 'game:cycle-speed':
        const speeds = [1, 2, 4];
        const currentIndex = speeds.indexOf(state.game.speed);
        const nextSpeed = speeds[(currentIndex + 1) % speeds.length];
        return {
          ...state,
          game: { ...state.game, speed: nextSpeed }
        };

      case 'game:tick':
        return {
          ...state,
          game: { ...state.game, tick: state.game.tick + 1 }
        };

      // Camera actions
      case 'camera:move':
        return {
          ...state,
          camera: {
            ...state.camera,
            x: state.camera.x + action.payload.dx,
            y: state.camera.y + action.payload.dy
          }
        };

      case 'camera:zoom':
        return {
          ...state,
          camera: {
            ...state.camera,
            zoom: Math.max(0.5, Math.min(3.0, state.camera.zoom + action.payload.delta))
          }
        };

      case 'camera:set':
        return {
          ...state,
          camera: { ...state.camera, ...action.payload }
        };

      // Tool actions
      case 'tool:select':
        return {
          ...state,
          ui: { ...state.ui, selectedTool: action.payload.tool }
        };

      // Tile actions
      case 'tile:hover':
        return {
          ...state,
          ui: { ...state.ui, hoveredTile: action.payload.tile }
        };

      case 'tile:select':
        return {
          ...state,
          ui: { ...state.ui, selectedTile: action.payload.tile }
        };

      case 'tile:update':
        const { x, y, updates } = action.payload;
        const tileIndex = y * state.map.width + x;
        const newTiles = [...state.map.tiles];
        newTiles[tileIndex] = { ...newTiles[tileIndex], ...updates };
        return {
          ...state,
          map: { ...state.map, tiles: newTiles }
        };

      // Zone actions
      case 'zone:place':
        const zoneId = action.payload.zoneId || `zone-${Date.now()}`;
        return {
          ...state,
          zones: {
            ...state.zones,
            [zoneId]: action.payload.zone
          }
        };

      case 'zone:remove':
        const { [action.payload.zoneId]: removed, ...remainingZones } = state.zones;
        return {
          ...state,
          zones: remainingZones
        };

      // Building actions
      case 'building:place':
        const buildingId = `building-${Date.now()}`;
        return {
          ...state,
          buildings: {
            ...state.buildings,
            [buildingId]: action.payload.building
          },
          resources: {
            ...state.resources,
            budget: state.resources.budget - (action.payload.building.cost || 0)
          }
        };

      case 'building:remove':
        const { [action.payload.buildingId]: removedBuilding, ...remainingBuildings } = state.buildings;
        return {
          ...state,
          buildings: remainingBuildings,
          resources: {
            ...state.resources,
            budget: state.resources.budget + ((removedBuilding?.cost || 0) * 0.5) // 50% refund
          }
        };

      // Entity actions
      case 'entity:spawn':
        return {
          ...state,
          entities: [...state.entities, action.payload.entity]
        };

      case 'entity:remove':
        return {
          ...state,
          entities: state.entities.filter(e => e.id !== action.payload.entityId)
        };

      case 'entity:update':
        return {
          ...state,
          entities: state.entities.map(e =>
            e.id === action.payload.entityId
              ? { ...e, ...action.payload.updates }
              : e
          )
        };

      case 'entities:clear':
        return {
          ...state,
          entities: []
        };

      // Time actions
      case 'time:advance':
        const newHour = state.time.hour + action.payload.delta;
        let newDay = state.time.day;
        let newMonth = state.time.month;
        let newYear = state.time.year;
        let adjustedHour = newHour;

        if (adjustedHour >= 24) {
          adjustedHour = adjustedHour % 24;
          newDay += Math.floor(newHour / 24);

          const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
          if (newDay > daysInMonth[newMonth - 1]) {
            newDay = 1;
            newMonth++;
            if (newMonth > 12) {
              newMonth = 1;
              newYear++;
            }
          }
        }

        return {
          ...state,
          time: {
            hour: adjustedHour,
            day: newDay,
            month: newMonth,
            year: newYear
          }
        };

      // Season actions
      case 'season:update':
        return {
          ...state,
          season: { ...state.season, ...action.payload }
        };

      // Resources actions
      case 'resources:update':
        return {
          ...state,
          resources: { ...state.resources, ...action.payload }
        };

      case 'resources:spend':
        if (state.resources.budget < action.payload.amount) {
          console.warn('[Store] Insufficient budget');
          return state;
        }
        return {
          ...state,
          resources: {
            ...state.resources,
            budget: state.resources.budget - action.payload.amount
          }
        };

      case 'resources:earn':
        return {
          ...state,
          resources: {
            ...state.resources,
            budget: state.resources.budget + action.payload.amount
          }
        };

      // Stats actions
      case 'stats:update':
        return {
          ...state,
          stats: { ...state.stats, ...action.payload }
        };

      // Services actions
      case 'services:update':
        return {
          ...state,
          services: {
            ...state.services,
            [action.payload.service]: {
              ...state.services[action.payload.service],
              ...action.payload.updates
            }
          }
        };

      // UI actions
      case 'ui:open-settings':
        console.log('[Store] Opening settings (not yet implemented)');
        return state;

      case 'ui:set-preview':
        return {
          ...state,
          ui: {
            ...state.ui,
            preview: {
              tiles: action.payload.tiles,
              tool: action.payload.tool
            }
          }
        };

      case 'ui:clear-preview':
        return {
          ...state,
          ui: {
            ...state.ui,
            preview: {
              tiles: [],
              tool: null
            }
          }
        };

      default:
        console.warn('[Store] Unknown action type:', action.type);
        return state;
    }
  }

  return {
    getState,
    subscribe,
    dispatch
  };
}
