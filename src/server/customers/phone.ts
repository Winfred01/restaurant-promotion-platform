const DEFAULT_COUNTRY_CALLING_CODE = "1";
const MIN_E164_DIGITS = 8;
const MAX_E164_DIGITS = 15;

export class InvalidPhoneNumberError extends Error {
  readonly code = "INVALID_PHONE_NUMBER";

  constructor(message = "Phone number is invalid") {
    super(message);
    this.name = "InvalidPhoneNumberError";
  }
}

export function requireFictionalDemoPhone(input: string) {
  const normalized = normalizePhoneNumber(input);
  if (!/^\+141655501\d{2}$/.test(normalized)) {
    throw new InvalidPhoneNumberError("Use a fictional demo number from (416) 555-0100 to 0199.");
  }
  return normalized;
}

function invalidPhoneNumber(): never {
  throw new InvalidPhoneNumberError();
}

function validateE164Digits(digits: string) {
  if (
    digits.length < MIN_E164_DIGITS ||
    digits.length > MAX_E164_DIGITS ||
    digits.startsWith("0")
  ) {
    invalidPhoneNumber();
  }

  return `+${digits}`;
}

export function normalizePhoneNumber(input: string) {
  const value = input.trim();

  if (!value || !/^[+\d\s().-]+$/.test(value)) {
    invalidPhoneNumber();
  }

  const plusCount = value.match(/\+/g)?.length ?? 0;
  if (plusCount > 1 || (plusCount === 1 && !value.startsWith("+"))) {
    invalidPhoneNumber();
  }

  const digits = value.replace(/\D/g, "");

  if (value.startsWith("+")) {
    return validateE164Digits(digits);
  }

  if (value.startsWith("00")) {
    return validateE164Digits(digits.slice(2));
  }

  if (digits.length === 10) {
    return validateE164Digits(`${DEFAULT_COUNTRY_CALLING_CODE}${digits}`);
  }

  if (digits.length === 11 && digits.startsWith(DEFAULT_COUNTRY_CALLING_CODE)) {
    return validateE164Digits(digits);
  }

  return invalidPhoneNumber();
}
