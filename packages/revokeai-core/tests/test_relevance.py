import pytest

from revokeai_core import ScopeRouter


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("What was my HIV test result?", ["Virology/HIV Screen"]),
        ("Is my LDL cholesterol too high?", ["Lipid Panel"]),
        ("How much do I owe?", ["Billing Details"]),
        ("What is the patient's name?", ["Patient Identity"]),
        ("Did the hepatitis screen or the triglycerides look bad?", ["Lipid Panel", "Virology/HIV Screen"]),
        ("Summarise my report in two sentences.", []),
    ],
)
def test_routes_question_to_scopes(parsed, question, expected):
    assert [s.label for s in ScopeRouter().relevant(question, parsed.scopes)] == expected
