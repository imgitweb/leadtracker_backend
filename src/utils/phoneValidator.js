/**
 * Phone Number Validation and Normalization Utility
 * Formats numbers to standard E.164 format (+[country_code][number])
 */

export const normalizePhoneNumber = (rawPhone, defaultCountryCode = "91") => {
  if (!rawPhone) return { isValid: false, normalized: null, error: "Empty phone number" };

  // Strip all non-digit characters except leading +
  const cleaned = String(rawPhone).trim();
  const digitsOnly = cleaned.replace(/[^0-9]/g, "");

  if (!digitsOnly || digitsOnly.length < 8) {
    return { isValid: false, normalized: null, error: "Number too short" };
  }

  let finalNumber = "";

  if (cleaned.startsWith("+")) {
    finalNumber = `+${digitsOnly}`;
  } else if (digitsOnly.length === 10) {
    // Standard 10-digit mobile number, prefix default country code (e.g. 91)
    finalNumber = `+${defaultCountryCode}${digitsOnly}`;
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
    // 11 digits starting with 0 (e.g. 09876543210), strip 0 and prepend country code
    finalNumber = `+${defaultCountryCode}${digitsOnly.slice(1)}`;
  } else if (digitsOnly.length >= 11 && digitsOnly.length <= 15) {
    // Already has country code digits
    finalNumber = `+${digitsOnly}`;
  } else {
    return { isValid: false, normalized: null, error: "Invalid phone length" };
  }

  // Validate E.164 regex: + followed by 8 to 15 digits
  const e164Regex = /^\+[1-9]\d{7,14}$/;
  if (!e164Regex.test(finalNumber)) {
    return { isValid: false, normalized: null, error: "Invalid E.164 phone format" };
  }

  return { isValid: true, normalized: finalNumber, error: null };
};

/**
 * Validates and deduplicates a list of contact inputs
 */
export const processContactList = (contactRows, defaultCountryCode = "91") => {
  const validContacts = [];
  const invalidContacts = [];
  const duplicates = [];
  const seenPhones = new Set();

  for (const item of contactRows) {
    const rawPhone = item.phone || item.mobile || item.contact || item.phoneNumber || item.Phone || "";
    const name = item.name || item.fullName || item.customerName || item.Name || "Customer";
    const email = item.email || item.Email || "";

    const { isValid, normalized, error } = normalizePhoneNumber(rawPhone, defaultCountryCode);

    if (!isValid) {
      invalidContacts.push({ rawPhone, name, error });
      continue;
    }

    if (seenPhones.has(normalized)) {
      duplicates.push({ phone: normalized, name, reason: "Duplicate in file" });
      continue;
    }

    seenPhones.add(normalized);
    validContacts.push({
      name: String(name).trim() || "Customer",
      phone: normalized,
      email: String(email).trim(),
      customData: { ...item },
    });
  }

  return { validContacts, invalidContacts, duplicates };
};
