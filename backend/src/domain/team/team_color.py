"""Team accent colour — derive a vivid colour from kit palettes.

DDD role: Domain Service (pure function). A team's accent colour is
*derived* from the colours Sportmonks reports for its kits — never
invented. The kit primary is frequently white or black, so we scan the
palette and keep the DOMINANT vivid colour (most frequent across the
palette slots; ties broken by saturation).
"""


def _hex_to_rgb(value: str) -> tuple[int, int, int] | None:
    cleaned = value.strip().lstrip("#")
    if len(cleaned) != 6:
        return None
    try:
        return int(cleaned[0:2], 16), int(cleaned[2:4], 16), int(cleaned[4:6], 16)
    except ValueError:
        return None


def _saturation_lightness(rgb: tuple[int, int, int]) -> tuple[float, float]:
    """HSL saturation + lightness for an RGB triple (channels 0-255)."""
    r, g, b = (channel / 255.0 for channel in rgb)
    high, low = max(r, g, b), min(r, g, b)
    lightness = (high + low) / 2.0
    if high == low:
        return 0.0, lightness  # achromatic (white / black / grey)
    saturation = (high - low) / (1.0 - abs(2.0 * lightness - 1.0))
    return saturation, lightness


def pick_accent_color(hex_colors: list[str]) -> str | None:
    """The dominant vivid colour among ``hex_colors`` (kit-palette entries).

    Dominance = how often the colour occurs (a kit's main colour repeats
    across palette slots); ties are broken by vividness. Returns None when
    no entry is vivid enough — every colour is white / black / grey.
    """
    counts: dict[str, int] = {}
    vividness: dict[str, float] = {}
    for raw in hex_colors:
        rgb = _hex_to_rgb(raw)
        if rgb is None:
            continue
        saturation, lightness = _saturation_lightness(rgb)
        # Reject near-grey and near-white/near-black — poor accents.
        if saturation < 0.25 or lightness < 0.12 or lightness > 0.9:
            continue
        key = "#" + "".join(f"{channel:02X}" for channel in rgb)
        counts[key] = counts.get(key, 0) + 1
        vividness[key] = saturation * (1.0 - abs(lightness - 0.5))
    if not counts:
        return None
    return max(counts, key=lambda key: (counts[key], vividness[key]))
