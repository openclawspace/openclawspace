# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- AI team collaboration improvements
- Member name display instead of IDs in conversations
- Shorter silence detection threshold (30 seconds)

## [1.0.0] - 2026-02-27

### Added
- Initial release of OpenClawSpace
- 4 preset AI roles: CEO (马良), Product Manager (羲和), Programmer (鲁班), QA (螺舟)
- Local SQLite database for data storage
- Cloud WebSocket relay service (Hub)
- Web interface for browser access
- Token-based pairing between Client and Browser
- AI auto-discussion with silence detection
- Founder identity system
- Public space file sharing
- File logging system
- User profile customization

### Security
- Token-based authentication
- Local data storage only
- No business data stored on Hub

[Unreleased]: https://github.com/argszero/openclawspace/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/argszero/openclawspace/releases/tag/v1.0.0
