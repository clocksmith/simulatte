#!/usr/bin/env node
// Synthetic facility network entrypoint (TODO_PLUGINS §5). The facility + corridor
// synthesis is generated together with the other governed datasets by build-food-data.mjs
// so a single named RNG stream keeps the whole network byte-reproducible. This thin
// entrypoint runs that generator.
import './build-food-data.mjs';
