# STATUS timing publication chain
Publish the verified issue #213 work as a feature-branch chain.
The tracker remains draft/no-merge; global validation is deferred.

## Specs
S1. Publish the authorized commits, push and PRs. User approval: "sip, hagamos eso", answering "¿Autorizás hacer los commits, push y abrir el PR, aclarando que la validación global quedó diferida?"
S2. Use the authorized repository/session and nonclosing reference. Selected answer: "Autorizar publicación con Refs #213 (recomendado)".
S3. Use the selected delivery shape. Selected answer: "Cadena con rama integradora".

## Tasks
T1 | S1-S3 | inline | done | Create the draft tracker branch and publication plan; commit: c5eebb8575da1f62a7091816044ef120f456dc84.
T2 | S1-S3 | inline | done | Commit diagnostics with tests/docs/runtime, then Windows fixtures on dependent child branches; commits: 69932a043e9dea1a75647f29cbadc9c64ccb038c (diagnostics), bc656ea77f89a22f8ba038a482883c9cfbb9757d (fixtures).
T3 | S1-S3 | inline | in_progress | All PRs opened: #1950 tracker draft -> main; #1951 diagnostics -> tracker; #1953 fixtures -> diagnostics. Commit/push delivery metadata and read final remote/check state; delivery-evidence commit: pending.

## Log
L1. Original publication approval: "sip, hagamos eso".
L2. Target/session and reference selection: "Autorizar publicación con Refs #213 (recomendado)".
L3. Delivery selection: "Cadena con rama integradora".
L4. Verified target: github.com/Gentleman-Programming/gentle-shell; default branch main; issue #213 OPEN with status:approved. No PR template or contribution/size gate found in this checkout; exactly one type label will be used per PR. No protected size label is authorized.
L5. Original source baseline 9808b6ef25c54b83ccfca03c6d80fc2b3d4c71b9 is an ancestor of current main 9eac7ae80d9df0447e4f4980d0f2a0e98a6deccd, 52 commits behind. Keep the validated original baseline rather than incorporate unverified upstream changes during publication. All PRs are for review, not certified merge-ready.
L6. One bounded slicing pass: diagnostics, source tests, docs and generated runtime form one cohesive unit above 400 changed lines; the independent Windows fixture unit is smaller. Do not compress or omit tests/docs to force a size budget.
L7. Previously observed checks: timing 64/64 and independent 2/2 PASS; fixtures focal 4/4 and regression 219/219 PASS, independently repeated; typecheck has 186 baseline diagnostics and no regressions; whitespace/runtime parity checks passed. These results concern the original validated baseline, not current upstream integration.
L8. Deferred/unavailable proof: interrupted full suite, omitted global provider-contract/runtime-harness stages, unknown historical hang cause, POSIX execution unavailable, native assessment unavailable due undeclared untracked. No real STATUS, retries, authority mutation or new full-suite execution is authorized by publication.
L9. Preserve preexisting .status-213-checks/ untouched and untracked. Stage only named delivery files. No merge or protected-label operation is authorized.
L10. Branch plan: feat/213-status-timing (draft tracker -> main), feat/213-status-timing-diagnostics (diagnostics -> tracker), test/213-windows-fixtures (fixtures -> diagnostics).
L11. Three branches pushed successfully. Draft tracker: https://github.com/Gentleman-Programming/gentle-shell/pull/1950. Diagnostics: https://github.com/Gentleman-Programming/gentle-shell/pull/1951. Fixtures: https://github.com/Gentleman-Programming/gentle-shell/pull/1953. Child bases are immediate parents; labels are type:chore, type:feature and type:chore respectively.
L12. Combined inline publication command failed at shell parsing (unexpected EOF), before executing GitHub operations. Short gh commands using project-local body files work; exact long-command parsing cause is not proven.
L13. Current upstream workflow has additional installer matrix checks beyond the original checkout. No extra local suite was run or gate waived; required CI and upstream integration remain unverified. A Git blob-path diff command was also rejected by MSYS argument conversion; ordinary revision-plus-path diff confirmed the workflow addition without modifying files.
L14. PR bodies are retained under odd/prs/ as delivery metadata on the final child. No frozen native candidate bytes or incident data are included. Final CI readback will be reported, not waited on or treated as merge authorization.
