# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-05-26

### Added
- Initial open-source release
- 9 Lambda handlers: checkUpdate, getRegistry, getReleaseList, getReleaseLatestBundle, postCreateRelease, postUpdateRelease, postCreateRegistry, postUpdateRegistry, postInvalidateCache
- AWS SAM IaC template with CloudFront, S3, DynamoDB, API Gateway
- Local development setup with DynamoDB Local
- CI pipeline with type checking, formatting, audit, and secret scanning
