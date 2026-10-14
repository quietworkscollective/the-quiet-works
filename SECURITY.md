# Security

UNHELD is a static, client-side artwork. It has no accounts, no server-side code in this
repository, no cookies, no analytics and no network requests after the page loads. Its
Content-Security-Policy sets `connect-src 'none'`.

## Reporting a vulnerability

Report privately through GitHub's private vulnerability reporting:
**Security → Report a vulnerability** on this repository, or
<https://github.com/quietworkscollective/the-quiet-works/security/advisories/new>.

Do not open a public issue for a security problem. Include what you found, how to reproduce it,
and its impact. Reports are acknowledged within seven days. Fixes are released before details are
published, and reporters are credited unless they prefer not to be. There is no bug bounty.

## In scope

- Anything that makes the site load or execute content from another origin, store data, or send
  data anywhere.
- Weaknesses in the Content-Security-Policy or the response headers built into `dist/_headers`.
- Malicious or unsafe content accepted through any future contribution path (scene data, assets,
  copy). AGENTS.md #4: no executable code, shaders or scripts are accepted from submissions.
- Supply-chain issues in the build: dependencies, GitHub Actions, the deployment configuration.

## Out of scope

- Issues requiring a compromised browser or device.
- Self-XSS through the browser's developer tools.
- Reports from automated scanners without a demonstrated impact.
