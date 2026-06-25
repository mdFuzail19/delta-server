# Contributing to Delta Server

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies: `yarn install`
4. Set up local development (see [README - Running Locally](./README.md#running-locally))

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes following our coding standards
3. Ensure the build passes:
   ```bash
   yarn build
   ```
4. Run type checking:
   ```bash
   npx tsc --noEmit
   ```
5. Format your code:
   ```bash
   npx prettier --write .
   ```
6. Commit your changes with a descriptive message
7. Push and open a Pull Request

## Coding Standards

- **Language:** TypeScript (strict mode)
- **Style:** Follow existing patterns in the codebase
- **Naming:** PascalCase for DynamoDB columns, camelCase for API responses

## Pull Request Guidelines

- Keep PRs focused on a single change
- Include a clear description of what the PR does and why
- Reference any related issues
- Ensure CI passes before requesting review

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- For security vulnerabilities, see [SECURITY.md](./SECURITY.md)
- Include reproduction steps for bugs
- Include your Node.js version and OS

## Code of Conduct

Please read and follow our [Code of Conduct](./CODE_OF_CONDUCT.md).
