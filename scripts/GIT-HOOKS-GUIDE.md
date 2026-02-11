# Git Hooks Guide - Automated Release System

## Overview

This repository uses Git hooks to automate version bumping and release creation. The hooks make the release process as simple as a normal commit.

## How It Works

### Pre-Commit Hook
- Runs automatically when you execute `git commit`
- Asks if you want to bump the version and create a release (y/n)
- **Works in both VS Code and command line** - uses macOS dialogs in VS Code, terminal prompts in CLI
- If **no**: proceeds with a normal commit (no version changes)
- If **yes**:
  - Shows current version
  - Lets you choose: Patch, Minor, or Major version
  - Updates `package.json` version
  - Stages the version change
  - Creates a marker for the post-commit hook

### Post-Commit Hook
- Runs automatically after commit completes
- If version was bumped, creates an annotated git tag (e.g., `v0.2.0`)
- Reminds you to push with tags

### Automatic Tag Pushing
- Git is configured with `push.followTags = true`
- When you run `git push`, tags are automatically pushed
- Pushing a version tag triggers GitHub Actions to build and release

## Using in VS Code

The hooks work seamlessly with VS Code's Git integration:

1. **Stage your changes** in VS Code's Source Control panel
2. **Write commit message** in the message box
3. **Click the Commit button** (or press Cmd+Enter)
4. **Dialog appears** asking if you want to create a release
   - Click **"No"** for normal commit
   - Click **"Yes"** to bump version
5. If you clicked Yes, **another dialog appears** with version options:
   - Click **"Patch (X.Y.Z)"** for bug fixes
   - Click **"Minor (X.Y.Z)"** for new features
   - Click **"Major (X.Y.Z)"** for breaking changes
6. **Notification appears** confirming the tag was created
7. **Push** using VS Code's sync button or "Push" command

The dialogs are native macOS alerts that appear on top of VS Code.

## Workflow Example

### Normal Commit (No Release)

```bash
# Make your changes
git add .
git commit -m "fix: typo in readme"

# Hook asks: Do you want to bump version and create a release? (y/N):
# Press 'n' or just Enter

# Normal commit proceeds ✓
git push
```

### Release Commit (With Version Bump)

```bash
# Make your changes
git add .
git commit -m "feat: add new booking feature"

# Hook asks: Do you want to bump version and create a release? (y/N):
# Press 'y'

# Current version: 0.1.0
# Select version bump type:
#   1) Patch   → 0.1.1 (bug fixes)
#   2) Minor   → 0.2.0 (new features)
#   3) Major   → 1.0.0 (breaking changes)
# Enter choice (1-3): 2

# Version bumped to 0.2.0 ✓
# Tag v0.2.0 will be created after commit ✓

git push
# Pushes commit + tag → Triggers GitHub Actions release workflow
```

## What Happens After Push

1. **GitHub Actions Triggered**: The release workflow starts when the tag is pushed
2. **MSI Build**: Builds Windows installer on GitHub runners
3. **GitHub Release**: Creates a new release with the MSI attached
4. **Download Available**: Users can download from GitHub releases page

## Version Numbering Guide

Follow [Semantic Versioning](https://semver.org/):

- **Patch** (0.1.0 → 0.1.1): Bug fixes, small changes, no new features
- **Minor** (0.1.0 → 0.2.0): New features, backwards compatible
- **Major** (0.1.0 → 1.0.0): Breaking changes, major overhaul

## Version Bump Quick Reference

- **Patch** (1-2 small bug fixes, typos, minor improvements)
- **Minor** (new features, enhancements, multiple improvements)
- **Major** (breaking changes, major overhaul, API changes)

## Checking Current Version

```bash
# From package.json
node -p "require('./package.json').version"

# Or just open package.json
cat package.json | grep version
```

## Manual Release (Without Hooks)

If you need to create a release manually without the hooks:

```bash
# Update version
npm version 0.2.0 --no-git-tag-version

# Commit
git add package.json
git commit -m "chore: bump version to 0.2.0"

# Create tag
git tag -a v0.2.0 -m "Release version 0.2.0"

# Push
git push && git push --tags
```

Or use the PowerShell release script:

```powershell
.\scripts\create-release.ps1 -Version "0.2.0"
```

## Troubleshooting

### Hook doesn't run
- Ensure hooks are executable: `chmod +x .git/hooks/pre-commit .git/hooks/post-commit`
- Check Git config: `git config core.hooksPath` should be empty (uses default `.git/hooks`)

### Dialogs don't appear in VS Code
- Make sure you have permissions for VS Code to show notifications
- Try committing from the terminal instead: `git commit -m "message"`
- Check System Preferences → Notifications → Script Editor (macOS notifications)

### Tag already exists
```bash
# Delete local tag
git tag -d v0.2.0

# Delete remote tag
git push origin :refs/tags/v0.2.0

# Create new tag
git tag -a v0.2.0 -m "Release version 0.2.0"
git push --tags
```

### Want to skip hooks temporarily
```bash
# Skip all hooks including pre-commit
git commit --no-verify -m "message"
```

### Tags not pushing automatically
```bash
# Check config
git config push.followTags

# Should output: true
# If not, set it:
git config push.followTags true
```

## Disabling Hooks

If you want to disable the release automation:

```bash
# Rename hooks to disable them
mv .git/hooks/pre-commit .git/hooks/pre-commit.disabled
mv .git/hooks/post-commit .git/hooks/post-commit.disabled
```

To re-enable:
```bash
mv .git/hooks/pre-commit.disabled .git/hooks/pre-commit
mv .git/hooks/post-commit.disabled .git/hooks/post-commit
```

## Best Practices

1. **Update CHANGELOG.md** before committing a release
2. **Test locally** before creating a release
3. **Use meaningful commit messages** following conventional commits format:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `chore:` for maintenance tasks
   - `docs:` for documentation
4. **Patch releases** for quick bug fixes between features
5. **Minor releases** when you have a collection of new features
6. **Major releases** sparingly, when you have breaking changes

## Integration with DEPLOYMENT.md

This hook system complements the deployment guide in `DEPLOYMENT.md`:
- **Hooks**: Automate version bumping and tagging during development
- **GitHub Actions**: Build and release MSI installer
- **PowerShell Scripts**: Manual release creation and testing

Both workflows trigger the same GitHub Actions release pipeline.
