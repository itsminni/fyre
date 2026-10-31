/** Explicit build mode; missing backend configuration never enables fictional data. */
export const OFFLINE_DEMO = import.meta.env.MODE === 'demo';
export const LOCAL_STATE_PREFIX = OFFLINE_DEMO ? 'fyre_demo_' : 'fyre_';
