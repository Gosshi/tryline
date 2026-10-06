#!/bin/sh

# Vercel reverses the usual convention: 0 skips the build, 1 continues it.
previous_sha=${VERCEL_GIT_PREVIOUS_SHA:-}

if [ -z "$previous_sha" ]; then
  printf '%s\n' 'build: VERCEL_GIT_PREVIOUS_SHA is empty'
  exit 1
fi

if ! git cat-file -e "${previous_sha}^{commit}" 2>/dev/null; then
  printf '%s\n' 'build: previous deployment commit is unavailable or git failed'
  exit 1
fi

# Compare every commit since the last successful deployment, not only HEAD^.
if git diff --quiet "$previous_sha" HEAD -- . ':(exclude)docs' ':(exclude)specs'; then
  printf '%s\n' "skip: only docs/ and specs/ changed since $previous_sha"
  exit 0
else
  diff_status=$?
  if [ "$diff_status" -eq 1 ]; then
    printf '%s\n' "build: changes outside docs/ and specs/ since $previous_sha"
  else
    printf '%s\n' "build: git diff failed (exit $diff_status)"
  fi
  exit 1
fi
