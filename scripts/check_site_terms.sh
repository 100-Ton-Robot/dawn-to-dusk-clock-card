#!/bin/sh
# Fail if any commit message or committed content on any local branch matches a private list
# of site-specific terms. The list lives outside the repo; each line is an extended regex.
#
# Required when the hook runs. Set its path with: git config dawntoduskclock.siteTerms /path/to/terms.txt
# Prints which terms matched and in which commit, and never the surrounding lines.
set -eu

terms=$(git config --get dawntoduskclock.siteTerms || true)
if [ -z "$terms" ]; then
    echo "check_site_terms: ERROR: no list configured. Set one with: git config dawntoduskclock.siteTerms /path/to/terms.txt" >&2
    echo "check_site_terms: with no site terms of your own, point it at an empty file" >&2
    exit 2
fi
if [ ! -r "$terms" ]; then
    echo "check_site_terms: ERROR: cannot read the list at $terms" >&2
    exit 2
fi

hits=$(mktemp)
trap 'rm -f "$hits"' EXIT

for commit in $(git rev-list --branches); do
    git show --text --format=%B "$commit" |
        grep -a -i -o -E -f "$terms" |
        sort -u |
        sed "s/^/$(git rev-parse --short "$commit"): /" >>"$hits" || true
done

if [ -s "$hits" ]; then
    echo "check_site_terms: FAILED, site-specific terms found:" >&2
    sort -u "$hits" >&2
    exit 1
fi
echo "check_site_terms: clean ($(git rev-list --branches --count) commits)"
