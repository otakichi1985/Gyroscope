# `git status` helper that hides known noise from the shared-workflows junction.
#
# `context/workflows/*` and `context/.shared-workflows` are junction files into
# the shared `_shared` repo, so their changes belong to that repo -- but they
# show up dirty in THIS repo's `git status` every session and, if committed by
# mistake, pollute this project's history. Run this instead of a bare
# `git status --short` before committing; it prints only this project's own
# changes.
#
# Run from anywhere inside the repo; it resolves the repo root itself.
param()
$repo = (git rev-parse --show-toplevel) ?? (throw "not a git repo")
git -C $repo status --short | ForEach-Object {
  # status short line: "XY <path>". Strip the two status chars + space.
  $path = $_.Length -ge 3 ? $_.Substring(3) : $_
  if ($path -notmatch '^context/workflows/' -and $path -notmatch '^context/.shared-workflows') {
    $_
  }
}
