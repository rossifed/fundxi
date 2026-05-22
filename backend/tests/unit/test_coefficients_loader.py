"""Unit tests for the pricing-coefficients TOML loader."""

from pathlib import Path

import pytest

from src.valuation.coefficients import PricingCoefficients, load_coefficients


def _write(tmp_path: Path, body: str) -> Path:
    path = tmp_path / "pricing.toml"
    path.write_text(body, encoding="utf-8")
    return path


def test_missing_file_falls_back_to_code_defaults(tmp_path: Path) -> None:
    absent = tmp_path / "nope.toml"
    assert load_coefficients(absent) == PricingCoefficients()


def test_loads_overrides_from_toml(tmp_path: Path) -> None:
    path = _write(tmp_path, "w_goal_pct = 7.5\nk_rating = 0.06\n")
    coeffs = load_coefficients(path)
    assert coeffs.w_goal_pct == 7.5
    assert coeffs.k_rating == 0.06


def test_missing_key_keeps_its_default(tmp_path: Path) -> None:
    # Only w_goal_pct is overridden; every other field keeps its default.
    path = _write(tmp_path, "w_goal_pct = 9.0\n")
    coeffs = load_coefficients(path)
    assert coeffs.w_goal_pct == 9.0
    assert coeffs.w_assist_pct == PricingCoefficients().w_assist_pct
    assert coeffs.w_red_card_pct == PricingCoefficients().w_red_card_pct


def test_unknown_key_is_a_loud_error(tmp_path: Path) -> None:
    # A typo (w_goal_pc instead of w_goal_pct) must NOT be silently ignored.
    path = _write(tmp_path, "w_goal_pc = 7.0\n")
    with pytest.raises(ValueError, match="unknown pricing coefficient"):
        load_coefficients(path)


def test_non_numeric_value_is_rejected(tmp_path: Path) -> None:
    path = _write(tmp_path, 'w_goal_pct = "high"\n')
    with pytest.raises(ValueError, match="must be a number"):
        load_coefficients(path)


def test_integer_toml_value_is_coerced_to_float(tmp_path: Path) -> None:
    path = _write(tmp_path, "w_goal_pct = 8\n")
    coeffs = load_coefficients(path)
    assert coeffs.w_goal_pct == 8.0
    assert isinstance(coeffs.w_goal_pct, float)


def test_shipped_config_matches_the_dataclass_fields() -> None:
    """The committed config/pricing.toml must load cleanly — i.e. it has
    no unknown keys and no non-numeric values (guards against a typo in
    the real file landing in the repo)."""
    repo_toml = Path(__file__).resolve().parents[2] / "config" / "pricing.toml"
    assert repo_toml.is_file(), "config/pricing.toml is missing"
    coeffs = load_coefficients(repo_toml)
    assert isinstance(coeffs, PricingCoefficients)
