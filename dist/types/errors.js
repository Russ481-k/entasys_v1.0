export class VersionError extends Error {
  constructor(message, version) {
    super(message);
    this.version = version;
    this.name = 'VersionError';
  }
}
export class DomainError extends Error {
  constructor(message, code, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'DomainError';
  }
}
export const DomainErrorCodes = {
  DOMAIN_NOT_FOUND: 'DOMAIN_NOT_FOUND',
  DOMAIN_ALREADY_EXISTS: 'DOMAIN_ALREADY_EXISTS',
  DOMAIN_VALIDATION_ERROR: 'DOMAIN_VALIDATION_ERROR',
  DOMAIN_UPDATE_ERROR: 'DOMAIN_UPDATE_ERROR',
  DOMAIN_DELETE_ERROR: 'DOMAIN_DELETE_ERROR',
};
