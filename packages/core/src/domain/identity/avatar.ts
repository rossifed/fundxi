/* Avatar — deterministic identity visual.
 *
 * DDD role: Value Object + pure Domain Service. Given a stable seed
 * (user_id, league_id, …) and a display name, produces:
 *   - 1–2 uppercase initials (Slack-style)
 *   - a background color picked from a fixed palette via a hash of
 *     the seed (so the same entity always gets the same color)
 *
 * Pure, deterministic, zero I/O. The UI ``<Avatar>`` component just
 * renders the precomputed { initials, bg_color }. */

import { avatar_ramp } from "../../design/palette";

export interface AvatarPresentation {
  initials: string;
  bg_color: string;
}

export function compute_initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0]! + words[1][0]!).toUpperCase();
}

function hash_seed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function compute_avatar(seed: string, name: string): AvatarPresentation {
  return {
    initials: compute_initials(name),
    bg_color: avatar_ramp[hash_seed(seed) % avatar_ramp.length]!,
  };
}
