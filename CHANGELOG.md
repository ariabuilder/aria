# Changelog

All notable changes to Aria will be documented here.

This project is pre-v1. Breaking changes may happen in minor releases until
`1.0.0`.

The format follows a simple human-readable structure:

- `Added` for new features.
- `Changed` for behavior changes.
- `Deprecated` for features that will be removed later.
- `Removed` for removed features.
- `Fixed` for bug fixes.
- `Security` for vulnerability fixes or hardening work.

## Unreleased

### Added

- Nothing yet.

### Changed

- Nothing yet.

### Fixed

- Nothing yet.

### Security

- Nothing yet.

## 0.5.9

### Added

- Initial open source community docs.
- Security policy for pre-launch and pre-v1 vulnerability reporting.
- Discord announcements for published GitHub Releases, including the release name
  and link.

### Changed

- Refined Aria's admin controls, design settings, typography copy, and variable
  table layout for a more consistent editing experience.
- Improved the Stage markup preview with independent visibility, smooth
  transitions, and copy-confirmation feedback.

### Fixed

- Ensured release announcements post once to avoid duplicate Discord messages.
- Corrected Composer options-menu template syntax and related control sizing.
- Improved destructive-action text contrast and aligned French font-upload
  terminology.

### Security

- Disabled Discord mention parsing in release announcements.

## 0.5.8

### Changed

- npm scripts and tooling launchers are cross-platform on Windows Command Prompt,
  PowerShell, macOS, and Linux without WSL or shell-specific environment syntax.
- CI runs the full test, check, build, runtime-startup, and package smoke sequence
  on both Ubuntu and Windows.

### Fixed

- Windows runtime and script failures caused by shell-specific environment
  assignment, `rm -rf`, and `npx` wrappers in npm scripts.
- Wrangler D1 query execution so inline SQL returns results reliably via
  `--command`.

## 0.5.7

Initial commit. LFG.
