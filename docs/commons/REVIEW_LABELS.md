# Commons review labels

GitHub labels are repository settings, not files stored in this repository. These labels are the requested human-review vocabulary; a repository maintainer must create them in GitHub before templates can apply them. GitHub issue forms ignore labels that do not already exist.

| Label | Meaning | Applied by |
|---|---|---|
| `commons:human-review` | Needs editorial, safety, provenance, and licence review by a person. A green check does not remove this label. | The proposal form requests it; maintainers apply it to pull requests. |
| `commons:validation-failed` | The read-only validator found a structural, scope, path, hash, or text-rule failure. | A maintainer, after inspecting the CI result. |
| `commons:reviewed` | A human has completed review. It does not mean the contribution is published. | A maintainer only. |

No workflow has write permission to apply or remove labels. Labels do not change the human-review or publication requirements.
