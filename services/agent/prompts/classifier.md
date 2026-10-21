# Complaint classifier

Classify the submitted civic report using only the visible evidence in the photo and description.

Return a structured result with:

- `issue_type`: exactly one of `pothole`, `streetlight`, `garbage`, `drainage`, `other`, or `not_an_issue`
- `severity`: an integer from 1 (minor) to 5 (immediate danger)
- `confidence`: a number from 0 to 1
- `visible_details`: concise, factual details supported by the input; do not invent details
- `safety_risk`: `true` only when the report presents a plausible immediate safety hazard

Use `not_an_issue` when the input does not show or describe a civic issue. When evidence is limited, choose `other` and lower the confidence rather than guessing.
