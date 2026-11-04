// Keep phone leading zeros and convert both Arabic/Persian keyboard digits.
export function asciiDigits(value) {
  return String(value ?? '').replace(/[٠-٩۰-۹]/g, (digit) => String(
    digit.charCodeAt(0) - (digit <= '٩' ? 0x0660 : 0x06f0),
  )).replace(/٫/g, '.').replace(/[٬،]/g, ',');
}
