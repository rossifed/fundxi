// Per-team aggregate match statistics — keyed by Sportmonks type code
// (e.g. "ball_possession_percentage", "shots_total"). The map is open
// because Sportmonks ships ~40 distinct types; the UI selects a subset
// to render.
export type TeamMatchStats = Record<string, Record<string, number>>;
