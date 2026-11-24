// Catches obvious typos without requiring a full RFC 5322 parser.
export const isValidEmail = (value: string): boolean => /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/.test(value)
