import { writable } from 'svelte/store';

export const defaultUiState = {
    isComputing: false,
    hasRoute: false,
    status: 'Load a GPX/KML/GeoJSON route via Windy upload to begin.',
    routeName: 'Uploaded route',
    totalEffort: null,
    distanceKm: 0,
    ascentM: 0,
    descentM: 0,
    weatherImpact: 0,
    elevationProfile: [],
    routeGraphSegments: [],
    model: 'unknown',
    forecastTime: 'unknown',
    segmentCount: 0,
    weatherWeightPercent: 75,
    candidateCount: 0,
    computedAt: '',
};

export const uiState = writable({ ...defaultUiState });

export const patchUiState = partial =>
    uiState.update(current => ({ ...current, ...partial }));

export const resetUiState = () => {
    uiState.set({ ...defaultUiState });
};
