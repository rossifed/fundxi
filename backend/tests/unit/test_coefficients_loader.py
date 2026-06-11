"""Unit tests for the pricing-coefficients TOML loader."""

import os
from pathlib import Path

import pytest

import src.valuation.coefficients as cf
from src.valuation.coefficients import PricingCoefficients, current_coefficients, load_coefficients


def _write(tmp_path: Path, body: str) -> Path:
    path = tmp_path / "pricing.toml"
    path.write_text(body, encoding="utf-8")
    return path


def test_missing_file_falls_back_to_code_defaults(tmp_path: Path) -> None:
    absent = tmp_path / "nope.toml"
    assert load_coefficients(absent) == PricingCoefficients()


def test_loads_overrides_from_toml(tmp_path: Path) -> None:
    path = _write(tmp_path, "w_shot_on_target_pct = 7.5\nk_rating = 0.06\n")
    coeffs = load_coefficients(path)
    assert coeffs.w_shot_on_target_pct == 7.5
    assert coeffs.k_rating == 0.06


def test_missing_key_keeps_its_default(tmp_path: Path) -> None:
    # Only w_shot_on_target_pct is overridden; every other field keeps its default.
    path = _write(tmp_path, "w_shot_on_target_pct = 9.0\n")
    coeffs = load_coefficients(path)
    assert coeffs.w_shot_on_target_pct == 9.0
    assert coeffs.w_xa_per_0_1_pct == PricingCoefficients().w_xa_per_0_1_pct
    assert coeffs.w_suspension_frac == PricingCoefficients().w_suspension_frac


def test_unknown_key_is_a_loud_error(tmp_path: Path) -> None:
    # A typo (missing trailing 't') must NOT be silently ignored.
    path = _write(tmp_path, "w_shot_on_target_pc = 7.0\n")
    with pytest.raises(ValueError, match="unknown pricing coefficient"):
        load_coefficients(path)


def test_non_numeric_value_is_rejected(tmp_path: Path) -> None:
    path = _write(tmp_path, 'w_shot_on_target_pct = "high"\n')
    with pytest.raises(ValueError, match="must be a number"):
        load_coefficients(path)


def test_integer_toml_value_is_coerced_to_float(tmp_path: Path) -> None:
    path = _write(tmp_path, "w_shot_on_target_pct = 8\n")
    coeffs = load_coefficients(path)
    assert coeffs.w_shot_on_target_pct == 8.0
    assert isinstance(coeffs.w_shot_on_target_pct, float)


def test_shipped_config_matches_the_dataclass_fields() -> None:
    """The committed config/pricing.toml must load cleanly — i.e. it has
    no unknown keys and no non-numeric values (guards against a typo in
    the real file landing in the repo)."""
    repo_toml = Path(__file__).resolve().parents[2] / "config" / "pricing.toml"
    assert repo_toml.is_file(), "config/pricing.toml is missing"
    coeffs = load_coefficients(repo_toml)
    assert isinstance(coeffs, PricingCoefficients)


# --- hot reload (live calibration without restart) -----------------------


def test_current_coefficients_hot_reloads_on_mtime_change(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    p = tmp_path / "pricing.toml"
    # Deterministic start: reset the module's hot-reload cache.
    monkeypatch.setattr(cf, "_hot_cache", (-1.0, PricingCoefficients()))

    p.write_text("w_suspension_frac = -0.20\n", encoding="utf-8")
    os.utime(p, (1000, 1000))
    assert current_coefficients(p).w_suspension_frac == -0.20

    # An edit (new mtime) is picked up on the next call — no restart.
    p.write_text("w_suspension_frac = -0.05\n", encoding="utf-8")
    os.utime(p, (2000, 2000))
    assert current_coefficients(p).w_suspension_frac == -0.05


def test_current_coefficients_keeps_last_good_on_a_bad_live_edit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    p = tmp_path / "pricing.toml"
    monkeypatch.setattr(cf, "_hot_cache", (-1.0, PricingCoefficients()))

    p.write_text("w_suspension_frac = -0.07\n", encoding="utf-8")
    os.utime(p, (1000, 1000))
    assert current_coefficients(p).w_suspension_frac == -0.07

    # A typo saved mid-tournament must NOT crash the price feed: keep last good.
    p.write_text("w_suspension_frc = -0.99\n", encoding="utf-8")  # missing 'a'
    os.utime(p, (2000, 2000))
    assert current_coefficients(p).w_suspension_frac == -0.07  # unchanged, no raise
