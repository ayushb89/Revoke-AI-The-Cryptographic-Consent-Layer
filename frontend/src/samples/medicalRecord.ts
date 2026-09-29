// Mirror of scripts/fixtures/mock_medical_report.md — fictional patient data.
export const SAMPLE_FILENAME = 'jane_doe_lab_report.md'

export const SAMPLE_TEXT = `# Patient Details
Name: Jane Q. Doe
Date of Birth: 1987-04-12
MRN: 00482913
Referring Physician: Dr. A. Rahman

LIPID PANEL
Total Cholesterol: 242 mg/dL (reference < 200) HIGH
LDL-C: 161 mg/dL (reference < 100) HIGH
HDL-C: 38 mg/dL (reference > 40) LOW
Triglycerides: 215 mg/dL (reference < 150) HIGH

Virology:
HIV-1/2 Ag/Ab Combo (4th gen): Non-reactive
Hepatitis C Antibody: Non-reactive
Hepatitis B Surface Antigen: Non-reactive

## Billing & Insurance
Insurer: Acme Health PPO, Policy #AH-55-1029
Claim ID: CLM-2026-0918-4471
Amount Due: $184.20
`

export function sampleFile(): File {
  return new File([SAMPLE_TEXT], SAMPLE_FILENAME, { type: 'text/markdown' })
}

export const SUGGESTED_PROMPTS = [
  'What was my HIV screen result?',
  'Is my LDL cholesterol in a healthy range?',
  'How much do I owe, and who is my insurer?',
  'Summarise my report in two sentences.',
]
