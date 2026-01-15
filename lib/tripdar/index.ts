/**
 * TripDAR Public Token System
 * 
 * Server-side utilities for the Tripd.ar public QR system.
 * 
 * @see README.md for full documentation
 */

// Authentication
export { requireTripdarKey } from './auth';

// Token utilities
export { 
  validatePublicToken, 
  generatePublicToken, 
  generateUniqueToken,
  TOKEN_LENGTHS,
  type TokenValidationResult,
} from './token';

// Public payload transformation
export { 
  toTripdarLookupPayload,
  toSurveySuccessPayload,
  toSurveyErrorPayload,
  type TripdarLookupPayload,
  type TripdarSurveyResponsePayload,
} from './publicPayload';

