## Pull Request Checklist

Please ensure all check boxes are completed before requesting review.

### General Compliance
- [ ] No emojis are used in the commit messages, code comments, documentation, or this description.
- [ ] No hardcoded secrets, tokens, or credentials are present.
- [ ] Code builds locally without compilation warnings or errors.

### Testing & Verification
- [ ] Backend tests have been verified using `pytest backend/tests/` and pass.
- [ ] Frontend builds cleanly using `npm run build`.
- [ ] Verification walkthrough is documented.

### Accessibility (A11y)
- [ ] All new interactive elements have appropriate `aria-label` tags.
- [ ] Checked keyboard navigability and contrast where applicable.

---

## Description of Changes

Describe the changes proposed by this pull request. Explain the rationale and design decisions.

---

## How to Test

Provide step-by-step instructions on how the reviewer can test these changes.
