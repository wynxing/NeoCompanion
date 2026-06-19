# Changelog

All notable changes to NeoCompanion will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Documentation quality improvement initiative: added `LICENSE`, `CLAUDE.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/DEVELOPMENT.md`, `docs/API.md`, `docs/TTS_SETUP.md`, `docs/GLOSSARY.md`, `docs/TODO_INVENTORY.md`, `docs/TESTING.md`, and `scripts/verify-docs.sh`.

### Fixed

- Corrected stale product name references in `docs/ARCHITECTURE.md` to match the project name.
- Replaced broken Windows-absolute `file:///` links in `docs/PRD_overview.md` with relative paths.
- Updated MiMo TTS missing-base-URL error to point to `docs/TTS_SETUP.md`.
- Marked the GitHub Actions implementation plan as implemented.

## [0.1.0] - 2026-06-19

### Added

- Floating desktop companion widget with 2D sprite animation and TTS feedback.
- Companion panel window for task management, AI chat, settings, and Hook approvals.
- Wallpaper status layer (Windows) embedding weather, time, focus ring, task progress, and assistant messages via `tauri-plugin-wallpaper`.
- Local Fastify sidecar exposing REST API and WebSocket hub on `localhost:10103`.
- SQLite persistence for tasks, focus sessions, conversations, messages, settings, and window events via Drizzle ORM.
- Pomodoro-style focus timer with companion feedback.
- Local task list with create/update/status change support.
- AI chat adapter for DeepSeek with streaming responses.
- MiMo TTS adapter for spoken companion feedback.
- Weather summary service.
- Active-window snapshot service with focused/distracted/stuck classification.
- Hook system for external agents to push status updates and request permissions.
- Knowledge workspace UI (v3.3) with Projects, Notes, Kanban Board, and Tasks — front-end mock stage; real backend storage and search are planned.
- GitHub Actions workflows for PR checks, cross-platform Tauri builds, and tag-triggered releases.
