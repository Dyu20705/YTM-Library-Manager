# Clean Code & Anti-Slop Guidelines for AI Agents

When modifying or adding code to this project, adhere strictly to the following standards:

## 1. The Core Directive
- **Improve the code that needs improvement. Do not change code merely because it could be written differently.**
- Preserve existing architecture, API contracts, UX, and domain logic.
- Do not refactor unrelated files or lines during feature or bug-fix tasks.

## 2. Comments & Documentation
- **Do not write obvious comments.** Never narrate syntax (e.g. `// increment i`, `// return response`).
- **Do not write conversational comments.** No "Now let's...", "Assuming this is...", or apologies.
- **Do not use ASCII banner dividers** (e.g. `// ================== HELPERS ==================`).
- **Only write comments explaining WHY:** Document non-obvious domain logic, upstream workarounds, security constraints, or algorithm trade-offs.
- Do not write JSDoc/docstrings that merely restate function and parameter names verbatim.

## 3. Abstractions & Architecture
- **Do not introduce speculative generality.** No single-implementation interfaces, premature factory patterns, or repository wrappers where direct code suffices.
- Follow the Rule of Three: Only abstract when a pattern is repeated >= 3 times.
- Keep simple operations direct and readable.

## 4. Error Handling
- **Never swallow errors silently.** Do not write empty `catch (e) {}` or `except: pass` blocks.
- Never write `catch (e) { console.log(e); return null; }` to mask crashes.
- Propagate errors cleanly with actionable context or log them with structured detail.

## 5. Dependencies & Standard Library
- Prefer standard library utilities over adding new external dependencies for trivial tasks.
- Check existing project utilities (`utils/`, `lib/`, `helpers/`) before writing a new helper function. Never reinvent common helpers (dates, strings, objects).

## 6. Testing Integrity
- Write tests that verify real behavior, boundary conditions, and edge cases.
- Do not mock the unit under test.
- Do not write hollow or tautological assertions (`expect(true).toBe(true)`).

## 7. Verification Before Completion
- Run the project test suite and linter before declaring work complete.
- Review your own git diff line-by-line: eliminate any unintended edits, stray debugging logs, or redundant comments before finalizing.
