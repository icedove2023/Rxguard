import {
  safetyLabel,
  safetyColor,
  calcBmi,
  bmiCategory,
  roleLabel,
  initials,
  truncate,
  Validate,
} from '../index';

describe('safetyLabel', () => {
  it('returns Pending for null/undefined scores', () => {
    expect(safetyLabel(null)).toBe('Pending');
    expect(safetyLabel(undefined)).toBe('Pending');
  });

  it('returns Safe for scores >= 90', () => {
    expect(safetyLabel(90)).toBe('Safe');
    expect(safetyLabel(100)).toBe('Safe');
  });

  it('returns Review Needed for scores 70-89', () => {
    expect(safetyLabel(70)).toBe('Review Needed');
    expect(safetyLabel(89)).toBe('Review Needed');
  });

  it('returns Flagged for scores below 70', () => {
    expect(safetyLabel(69)).toBe('Flagged');
    expect(safetyLabel(0)).toBe('Flagged');
  });
});

describe('safetyColor', () => {
  it('returns a defined color string for every branch', () => {
    expect(typeof safetyColor(null)).toBe('string');
    expect(typeof safetyColor(95)).toBe('string');
    expect(typeof safetyColor(75)).toBe('string');
    expect(typeof safetyColor(10)).toBe('string');
  });
});

describe('calcBmi', () => {
  it('calculates BMI correctly for known values', () => {
    // 70kg at 170cm -> 24.2
    expect(calcBmi(170, 70)).toBeCloseTo(24.2, 1);
  });

  it('rounds to one decimal place', () => {
    const result = calcBmi(165, 60);
    expect(Number.isInteger(result * 10)).toBe(true);
  });
});

describe('bmiCategory', () => {
  it('classifies underweight correctly', () => {
    expect(bmiCategory(17)).toBe('underweight');
  });

  it('classifies normal weight correctly', () => {
    expect(bmiCategory(22)).toBe('normal');
  });

  it('classifies overweight correctly', () => {
    expect(bmiCategory(27)).toBe('overweight');
  });

  it('classifies obese tiers correctly', () => {
    expect(bmiCategory(32)).toBe('obese_I');
    expect(bmiCategory(37)).toBe('obese_II');
    expect(bmiCategory(45)).toBe('obese_III');
  });
});

describe('roleLabel', () => {
  it('returns a human-readable label for known roles', () => {
    expect(roleLabel('consumer')).not.toBe('consumer');
    expect(roleLabel('pharmacist')).not.toBe('');
    expect(roleLabel('physician')).not.toBe('');
    expect(roleLabel('admin')).not.toBe('');
  });
});

describe('initials', () => {
  it('extracts initials from a full name', () => {
    expect(initials('Chidinma Okafor')).toBe('CO');
  });

  it('handles a single name', () => {
    expect(initials('Chidinma')).toBe('C');
  });

  it('handles null/undefined gracefully', () => {
    expect(initials(null)).toBeTruthy();
    expect(initials(undefined)).toBeTruthy();
  });
});

describe('truncate', () => {
  it('leaves short strings untouched', () => {
    expect(truncate('short', 20)).toBe('short');
  });

  it('truncates long strings', () => {
    const result = truncate('this is a very long string indeed', 10);
    expect(result.length).toBeLessThanOrEqual(11); // 10 chars + single ellipsis char
    expect(result).toContain('…');
  });
});

describe('Validate.email', () => {
  it('rejects empty input', () => {
    expect(Validate.email('')).not.toBeNull();
  });

  it('rejects malformed addresses', () => {
    expect(Validate.email('not-an-email')).not.toBeNull();
    expect(Validate.email('missing@domain')).not.toBeNull();
  });

  it('accepts a valid address', () => {
    expect(Validate.email('user@example.com')).toBeNull();
  });
});

describe('Validate.password', () => {
  it('rejects passwords under 8 characters', () => {
    expect(Validate.password('Aa1')).not.toBeNull();
  });

  it('rejects passwords without an uppercase letter', () => {
    expect(Validate.password('lowercase1')).not.toBeNull();
  });

  it('rejects passwords without a number', () => {
    expect(Validate.password('NoNumbersHere')).not.toBeNull();
  });

  it('accepts a strong password', () => {
    expect(Validate.password('Str0ngPassword')).toBeNull();
  });
});

describe('Validate.phone', () => {
  it('treats an empty phone as valid (optional field)', () => {
    expect(Validate.phone('')).toBeNull();
  });

  it('accepts a valid Nigerian-format number', () => {
    expect(Validate.phone('+2348012345678')).toBeNull();
  });

  it('rejects an obviously invalid number', () => {
    expect(Validate.phone('abc123')).not.toBeNull();
  });
});

describe('Validate.licenceNumber', () => {
  it('requires PCN prefix for pharmacists', () => {
    expect(Validate.licenceNumber('12345', 'pharmacist')).not.toBeNull();
    expect(Validate.licenceNumber('PCN/2022/000123', 'pharmacist')).toBeNull();
  });

  it('requires MDCN prefix for physicians', () => {
    expect(Validate.licenceNumber('12345', 'physician')).not.toBeNull();
    expect(Validate.licenceNumber('MDCN/2020/012345', 'physician')).toBeNull();
  });
});
