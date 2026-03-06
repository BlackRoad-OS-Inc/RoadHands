---
name: code-review
description: Custom code review guidelines for this repository
triggers:
- /codereview
---

# Repository Code Review Guidelines

You are reviewing code for OpenHands Web UI. Follow these guidelines:

## Review Decisions

### When to APPROVE
- Configuration changes following existing patterns
- Documentation-only changes
- Test-only changes without production code changes
- Simple additions following established conventions

### When to COMMENT
- Issues that need attention (bugs, security concerns)
- Suggestions for improvement
- Questions about design decisions
- Mark pragmatic trade-offs as 🟢 **Acceptable** - don't block PRs for out-of-scope improvements

## Core Principles

- Small improvements with few downsides are typically approved. One thing to check when making changes is to ensure that all continuous integration tests pass.
- We need to be careful with changes to the core agent, as it is imperative to maintain high quality. These PRs are evaluated based on three key metrics: Accuracy, Efficiency, Code Complexity
- If it improves accuracy, efficiency, or both with only a minimal change to code quality, we should consider approval.
- If there are bigger tradeoffs (e.g. helping efficiency a lot and hurting accuracy a little) we might want to ask for changes, like putting it behind a feature flag.

## What to Check

- **[DESCRIPTION]**: Does the PR description match the changes?
- **[DOCUMENTATION]**: Does the change require documentation, and if so was the change documented?
- **[TESTING]**: Is the issue reproducible? Was the fix tested? 

## Repository Conventions

- Use openhands/linter /__init__.py for style checking
- Follow Development.md style guide
- Tests should be in tests directory
- Check public docs https://docs.openhands.dev/openhands/usage/run-openhands/local-setup
