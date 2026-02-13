# Contributing to LiftIQ

## Development Flow

1. Create a feature branch from `main`.
2. Keep changes focused and small.
3. Include clear commit messages.
4. Open a pull request using the template.

## Pull Request Expectations

- Explain the problem and solution
- Document any behavior changes
- Include screenshots for UI updates
- Note test coverage or manual validation

## Code Guidelines

- Keep code readable and modular
- Avoid unrelated refactors in the same PR
- Preserve existing architecture unless change is justified

## Local Validation

Before opening a PR:

```bash
npm install
npm run start
```

If you touch ML or Pi code, run the relevant scripts you changed and include results in your PR description.
