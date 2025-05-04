# Security Policy

## Supported Versions

Currently supported versions for security updates:

| Version | Supported          |
| ------- | ------------------ |
| 2.1.x   | :white_check_mark: |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

We take the security of LeetDiscord seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Reporting Process

1. **DO NOT** create a public GitHub issue for the vulnerability.
2. Send an email to qwerky2003@gmail.com.
3. Include a detailed description of the vulnerability:
   - The location and nature of the vulnerability
   - Steps to reproduce the issue
   - Potential impact of the vulnerability
   - Any known mitigations

### What to Expect

- You will receive an acknowledgment within 48 hours.
- We will investigate and update you on acceptance/decline status within 1 week.
- We will maintain communication about our progress fixing the vulnerability.
- Once fixed, we will notify you and may request your review of the fix.

## Security Best Practices

### For Bot Administrators

1. **Discord Bot Token**
   - Never share your bot token
   - Rotate tokens if compromised
   - Use environment variables (.env) to store tokens
   - Add `.env` to your `.gitignore`

2. **MongoDB Security**
   - Use strong passwords for MongoDB Atlas
   - Enable IP whitelist in MongoDB Atlas
   - Never commit connection strings to version control
   - Use environment variables for database credentials

3. **Discord Permissions**
   - Use minimal required permissions for the bot
   - Regularly audit bot permissions
   - Set up proper role hierarchies

4. **Server Configuration**
   - Keep your Node.js installation updated
   - Regularly update dependencies
   - Monitor bot logs for suspicious activity
   - Back up configurations regularly

### For Contributors

1. **Development Environment**
   - Use separate development tokens and databases
   - Never commit sensitive information
   - Keep dependencies updated
   - Run `npm audit` regularly

2. **Code Guidelines**
   - Validate all user inputs
   - Use parameterized queries for MongoDB
   - Implement proper error handling
   - Follow secure coding practices

3. **Testing**
   - Run security checks before deploying
   - Test with minimum required permissions
   - Verify error handling works correctly

## Security Features

The bot includes several security features:

1. **Input Validation**
   - All Discord commands are validated
   - MongoDB queries are sanitized
   - User inputs are escaped properly

2. **Error Handling**
   - Secure error messages (no sensitive data)
   - Proper logging of security events
   - Graceful failure handling

3. **Access Control**
   - Permission-based command system
   - Role-based access control
   - Command cooldowns to prevent abuse

4. **Data Protection**
   - Minimal data collection
   - Regular data cleanup
   - Secure storage practices

## Known Issues

Check our [GitHub Security Advisories](../../security/advisories) for any current security issues.

## Recent Updates

### Security Changelog

#### 2.1.0 (2025-05-04)
- Added improved input validation
- Enhanced error logging
- Implemented command cooldowns
- Added automatic token rotation support

#### 2.0.0 (2025-05-02)
- Migrated to MongoDB Atlas with enhanced security
- Implemented secure environment variable handling
- Added comprehensive permission checks
- Enhanced logging for security events