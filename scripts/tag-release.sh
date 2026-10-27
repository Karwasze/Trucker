#!/usr/bin/env bash
# Creates an annotated tag on the newest commit of origin/main and pushes it.
#
# Usage: scripts/tag-release.sh v0.4.4
set -euo pipefail

if [[ $# -ne 1 ]]; then
	echo "Usage: $0 <tag>  (e.g. $0 v0.4.4)" >&2
	exit 1
fi

tag="$1"
remote="origin"
branch="main"

if [[ ! "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	echo "Tag '$tag' does not look like vMAJOR.MINOR.PATCH" >&2
	exit 1
fi

if ! fetch_output="$(git fetch --tags "$remote" "$branch" 2>&1)"; then
	echo "$fetch_output" >&2
	echo "Fetching from $remote failed. If a local tag differs from $remote's" \
		"(would clobber existing tag), delete it with 'git tag -d <tag>' and retry." >&2
	exit 1
fi

if git rev-parse --quiet --verify "refs/tags/$tag" >/dev/null; then
	echo "Tag '$tag' already exists" >&2
	exit 1
fi

commit="$(git rev-parse "$remote/$branch")"
echo "Tagging $(git log -1 --format='%h %s' "$commit") as $tag"

git tag -a "$tag" -m "$tag" "$commit"
git push "$remote" "refs/tags/$tag"
