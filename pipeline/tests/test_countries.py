from headwaters_pipeline.countries import get_country, output_dir, repo_root, shell_exports


def test_nz_writes_under_data_nz() -> None:
    country = get_country("nz")
    assert country.code == "nz"
    assert output_dir(country) == repo_root() / "web" / "public" / "data" / "nz"
    assert "nzsegment AS id" in country.tile_sql


def test_australia_uses_geofabric_network() -> None:
    country = get_country("au")
    assert country.gdb_name.endswith("SH_Network.gdb")
    assert country.layer == "AHGFNetworkStream"
    assert country.id_field == "HydroID"
    assert country.min_zoom == 2
    assert country.inland_layer == "AHGFNetworkNode"
    assert output_dir(country) == repo_root() / "web" / "public" / "data" / "au"


def test_shell_exports_quote_paths() -> None:
    env = shell_exports("nz")
    assert "COUNTRY=nz" in env
    assert "MIN_ZOOM=4" in env
    assert "reaches.pmtiles" in env
