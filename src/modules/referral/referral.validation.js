/**
 * Referral Module Validation Schemas & Helpers
 */

const validateAadhaar = (aadhaar) => {
  if (!aadhaar) return { valid: false, message: 'Aadhaar number is required' };
  const clean = String(aadhaar).replace(/\s+/g, '');
  if (!/^\d{12}$/.test(clean)) {
    return { valid: false, message: 'Aadhaar number must be exactly 12 digits' };
  }
  return { valid: true, clean };
};

const validatePan = (pan) => {
  if (!pan) return { valid: false, message: 'PAN number is required' };
  const clean = String(pan).trim().toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(clean)) {
    return { valid: false, message: 'Invalid PAN format. Must be 10 characters (e.g. ABCDE1234F)' };
  }
  return { valid: true, clean };
};

const validateIfsc = (ifsc) => {
  if (!ifsc) return { valid: false, message: 'IFSC code is required' };
  const clean = String(ifsc).trim().toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(clean)) {
    return { valid: false, message: 'Invalid IFSC code format (e.g. HDFC0001234)' };
  }
  return { valid: true, clean };
};

const validateAccountNumber = (accNo) => {
  if (!accNo) return { valid: false, message: 'Bank account number is required' };
  const clean = String(accNo).trim();
  if (!/^\d{9,18}$/.test(clean)) {
    return { valid: false, message: 'Account number must be between 9 and 18 digits' };
  }
  return { valid: true, clean };
};

const validatePayoutAmount = (amount, availableBalance, minLimit = 500) => {
  const num = Number(amount);
  if (!Number.isFinite(num) || num <= 0) {
    return { valid: false, message: 'Payout amount must be a positive number' };
  }
  if (num < minLimit) {
    return { valid: false, message: `Minimum payout request threshold is ₹${minLimit}` };
  }
  if (num > availableBalance) {
    return { valid: false, message: `Requested amount exceeds available balance (Max ₹${availableBalance})` };
  }
  return { valid: true, num };
};

const validateEmail = (email) => {
  if (!email || !String(email).trim()) return { valid: false, message: 'Email address is required' };
  const raw = String(email).trim();
  if (/[A-Z]/.test(raw)) {
    return { valid: false, message: 'Invalid email format. Capital/uppercase letters are not allowed (e.g. user@gmail.com)' };
  }
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  if (!emailRegex.test(raw)) {
    return { valid: false, message: 'Invalid email format (e.g. user@gmail.com)' };
  }
  return { valid: true, clean: raw };
};

module.exports = {
  validateAadhaar,
  validatePan,
  validateIfsc,
  validateAccountNumber,
  validatePayoutAmount,
  validateEmail
};
