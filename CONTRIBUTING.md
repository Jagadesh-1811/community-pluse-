# Contributing Guidelines

Thank you for contributing to CommunityPulse! To maintain a high level of code quality, security, and accessibility, please follow these guidelines.

## Development Standards

### Code Quality and Cleanliness
- Write clean, readable, and well-structured code.
- Avoid leaving commented-out code blocks or debug print statement remnants.
- Ensure all parameters, options, and variables are properly typed.

### Security Best Practices
- Never commit credentials, secrets, or API keys directly to the repository.
- Use environment variables (`.env` file) for configuration. Reference `env.example` to see required parameters.
- Verify role permissions through Firebase Realtime Database and ID token validation for administrative or protected endpoints.

### Formatting Rules
- Do not use emojis anywhere in the codebase, commit messages, or pull request descriptions. Keep documentation clean and plain-text.
- Maintain consistent indentation (2 spaces for TypeScript/React/CSS, 4 spaces for Python).

### Accessibility (A11y)
- All interactive controls (buttons, inputs, maps, selectors) must have descriptive `aria-label` tags to support screen readers.
- Respect semantic HTML hierarchies.

---

## Submission Process

### Branching and Commits
1. Branch off `main` using descriptive names: `feature/xyz` or `bugfix/abc`.
2. Keep commits atomic and write clear, concise commit messages.

### Pull Requests
- Populate the provided Pull Request template in detail.
- Ensure the frontend builds cleanly without Webpack or Next.js compile errors.
- Ensure all backend unit and integration tests pass before submitting.
