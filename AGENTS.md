# General guidelines

This document captures code conventions for this project. It is intended to help LLM agents understand how to work effectively with this codebase.

## General conventions

### Source control

- We use Jujutsu (jj).

### Documentation

- Use inline comments to explain "why", not just "what".
- Don't add narrative comments in function bodies. Only add a comment if what you're doing is non-obvious or special in some way, or if something needs a deeper "why" explanation.
- Keep doc comments local to the item they document. Describe what the item does and the contract it upholds, not how or where it's used elsewhere in the system. Don't speculate about callers, motivating scenarios, or other parts of the codebase that the item itself has no knowledge of.
- **Always** use periods at the end of code comments.
- **Never** use title case in headings and titles. Always use sentence case.
- Always use the Oxford comma.
- Use American English spelling everywhere.
- When a change introduces, removes, or changes a difference between LeanScript and native Lean, update `docs/differences.md`.
