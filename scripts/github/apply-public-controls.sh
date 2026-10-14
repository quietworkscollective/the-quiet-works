#!/usr/bin/env bash
# Applies the repository controls that GitHub's free plan only offers on public repositories:
# the main and tag rulesets, secret scanning with push protection, Dependabot alerts and
# security updates, private vulnerability reporting, and the fork pull-request approval policy.
#
# Usage:
#   scripts/github/apply-public-controls.sh              # dry run: checks and prints the plan
#   scripts/github/apply-public-controls.sh --apply      # applies to an already-public repository
#   scripts/github/apply-public-controls.sh --apply --make-public
#                                                        # makes it public, then applies at once
#
# Run only with the founder's explicit approval: making the repository public and changing its
# security settings are both release decisions (AGENTS.md #5). Read docs/PUBLIC_RELEASE.md first.
set -euo pipefail

REPO="${REPO:-quietworkscollective/the-quiet-works}"
APPLY=0
MAKE_PUBLIC=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --make-public) MAKE_PUBLIC=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done
cd "$(git rev-parse --show-toplevel)"

echo "== Release readiness (check:public --release)"
node scripts/check-public.mjs --release

visibility=$(gh api "repos/$REPO" --jq .visibility)
echo "== $REPO is $visibility"
if [ "$APPLY" -eq 0 ]; then
  echo "Dry run. With --apply this script would:"
  echo "  - $( [ "$MAKE_PUBLIC" -eq 1 ] && echo 'make the repository public, then ' )apply .github/rulesets/main.json and tags.json"
  echo "  - enable secret scanning, push protection, Dependabot alerts and security updates, private vulnerability reporting"
  echo "  - require approval for workflow runs from all external contributors"
  echo "  - delete branches on merge, disable wiki and projects (public repositories are always forkable)"
  exit 0
fi

if [ "$visibility" != "public" ]; then
  if [ "$MAKE_PUBLIC" -eq 1 ]; then
    echo "== Making the repository public"
    gh api -X PATCH "repos/$REPO" -f visibility=public --silent
  else
    echo "Rulesets need a public repository on the free plan. Re-run with --make-public." >&2
    exit 1
  fi
fi

apply_ruleset() {
  local file=$1 name id
  name=$(node -p "require('./$file').name")
  id=$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$name\") | .id")
  if [ -n "$id" ]; then
    gh api -X PUT "repos/$REPO/rulesets/$id" --input "$file" --silent
    echo "   updated ruleset $name"
  else
    gh api -X POST "repos/$REPO/rulesets" --input "$file" --silent
    echo "   created ruleset $name"
  fi
}
echo "== Rulesets"
apply_ruleset .github/rulesets/main.json
apply_ruleset .github/rulesets/tags.json

echo "== Security features"
gh api -X PATCH "repos/$REPO" --silent --input - <<'JSON'
{
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" }
  },
  "delete_branch_on_merge": true,
  "has_wiki": false,
  "has_projects": false
}
JSON
gh api -X PUT "repos/$REPO/vulnerability-alerts" --silent
gh api -X PUT "repos/$REPO/automated-security-fixes" --silent
gh api -X PUT "repos/$REPO/private-vulnerability-reporting" --silent

echo "== Actions"
gh api -X PUT "repos/$REPO/actions/permissions/workflow" --silent \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
gh api -X PUT "repos/$REPO/actions/permissions/fork-pr-contributor-approval" --silent \
  -f approval_policy=all_external_contributors

echo "== Verify"
gh api "repos/$REPO" --jq '{visibility, allow_forking, delete_branch_on_merge, security: .security_and_analysis}'
gh api "repos/$REPO/rulesets" --jq '.[] | {name, enforcement, target}'
echo "Done. Check docs/PUBLIC_RELEASE.md for the steps that follow."
