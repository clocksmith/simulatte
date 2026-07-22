#!/usr/bin/env node
// Freight-corridor synthesis entrypoint (TODO_PLUGINS §5). Corridors are derived from
// the synthetic facility network in build-food-data.mjs (FAF5 aggregate priors), so they
// are generated together to stay consistent with facility identities.
import './build-food-data.mjs';
