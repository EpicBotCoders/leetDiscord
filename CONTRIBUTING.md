# Contributing to LeetDiscord

We love your input! We want to make contributing to LeetDiscord as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## We Develop with Github
We use Github to host code, to track issues and feature requests, as well as accept pull requests.

## Development Process
We use Github Flow, so all code changes happen through pull requests.
Pull requests are the best way to propose changes to the codebase. We actively welcome your pull requests:

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes (`npm test`).
5. Make sure your code lints.
6. Issue that pull request!

## Local Development Setup
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `config.json` file based on the example configuration
4. Run tests:
   ```bash
   npm test
   ```

## Testing
We use Jest for our test suite. Please write tests for new code you create. To run tests:

```bash
npm test
```

To run tests in watch mode during development:

```bash
npm run test:watch
```

## Project Structure
- `/modules` - Core functionality modules
- `/modules/models` - Database models
- `/modules/__tests__` - Test files
- `/scripts` - Utility scripts
- `/logs` - Application logs

## Database
The project uses MongoDB. Make sure you have MongoDB installed and running locally for development.

## Any contributions you make will be under the MIT Software License
In short, when you submit code changes, your submissions are understood to be under the same [MIT License](http://choosealicense.com/licenses/mit/) that covers the project. Feel free to contact the maintainers if that's a concern.

## Report bugs using Github's [issue tracker](../../issues)
We use GitHub issues to track public bugs. Report a bug by [opening a new issue](../../issues/new).

## Write bug reports with detail, background, and sample code
**Great Bug Reports** tend to have:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)

## License
By contributing, you agree that your contributions will be licensed under its MIT License.

## References
This document was adapted from the open-source contribution guidelines for [Facebook's Draft](https://github.com/facebook/draft-js/blob/master/CONTRIBUTING.md).