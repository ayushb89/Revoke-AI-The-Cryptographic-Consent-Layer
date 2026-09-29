from revokeai_core import DocumentParser, compute_scope_hash


def test_splits_record_into_functional_scopes(parsed):
    assert parsed.labels == ["Patient Identity", "Lipid Panel", "Virology/HIV Screen", "Billing Details"]


def test_scope_content_stays_in_its_own_scope(parsed):
    assert "LDL-C: 161" in parsed.by_label("Lipid Panel").content
    assert "HIV-1/2" in parsed.by_label("Virology/HIV Screen").content
    assert "HIV" not in parsed.by_label("Lipid Panel").content
    assert "Jane Q. Doe" in parsed.by_label("Patient Identity").content
    assert "Amount Due" in parsed.by_label("Billing Details").content


def test_hashes_are_32_bytes_unique_and_match_scheme(parsed):
    assert len(set(parsed.scope_hashes)) == len(parsed.scopes)
    for scope in parsed.scopes:
        assert len(scope.scope_hash) == 32
        assert scope.scope_hash == compute_scope_hash(parsed.salt, scope.label, scope.content)


def test_same_salt_is_deterministic_new_salt_is_unlinkable(sample_record, parsed):
    again = DocumentParser().parse(sample_record, salt=parsed.salt)
    fresh = DocumentParser().parse(sample_record)
    assert again.scope_hashes == parsed.scope_hashes
    assert set(fresh.scope_hashes).isdisjoint(parsed.scope_hashes)


def test_sections_with_same_scope_are_merged_and_unknown_headings_kept():
    doc = "LDL:\nLDL-C: 100\n\nNotes From Visit:\nfollow up in 3 months\n\nHDL:\nHDL-C: 60"
    parsed = DocumentParser().parse(doc)
    assert parsed.labels == ["Lipid Panel", "Notes From Visit"]
    lipid = parsed.by_label("Lipid Panel").content
    assert "LDL-C: 100" in lipid and "HDL-C: 60" in lipid
