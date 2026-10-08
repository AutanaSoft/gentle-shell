# STATUS timing publication chain
Publish the verified issue #213 work as a feature-branch chain.
The tracker remains draft/no-merge; global validation is deferred.

## Specs
S1. Publish the authorized commits, push and PRs. User approval: "sip, hagamos eso", answering "¿Autorizás hacer los commits, push y abrir el PR, aclarando que la validación global quedó diferida?"
S2. Use the authorized repository/session and nonclosing reference. Selected answer: "Autorizar publicación con Refs #213 (recomendado)".
S3. Use the selected delivery shape. Selected answer: "Cadena con rama integradora".

## Tasks
T1 | S1-S3 | inline | done | Create the draft tracker branch and publication plan; commit: c5eebb8575da1f62a7091816044ef120f456dc84.
T2 | S1-S3 | inline | in_progress | Commit diagnostics with tests/docs/runtime, then Windows fixtures on dependent child branches; commits: pending.
T3 | S1-S3 | inline | pending | Push and open the draft tracker and both dependent PRs; record links and check state; commit: pending.

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
