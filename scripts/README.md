# Repo checks

Two checks keep secrets and site-specific details out of this repo's history.

| Check | Runs | Catches |
|---|---|---|
| gitleaks | Before each push, and in CI | Secrets, by pattern |
| `check_site_terms.sh` | Before each push | Terms from a private list: your own hostnames, IPs, camera names |

The site-term list stays outside the repo, because it holds the terms it protects. It is a text file with one extended regex per line:

```sh
git config dawntoduskclock.siteTerms /path/to/terms.txt
```

The hook needs a list. With none configured, it stops the push. If you have no site terms of your own, use an empty file:

```sh
touch ~/.dawntoduskclock-site-terms
git config dawntoduskclock.siteTerms ~/.dawntoduskclock-site-terms
```

CI runs only gitleaks, so it doesn't need a list.
