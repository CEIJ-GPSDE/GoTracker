// Validation functions
export class Validator {
  static validateTimeFilter(startInput, endInput) {
    const startValue = startInput.value;
    const endValue = endInput.value;
    const now = new Date();

    if (!startValue || !endValue) {
      return { isValid: false, error: 'required' };
    }

    const startTime = new Date(startValue);
    const endTime = new Date(endValue);

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return { isValid: false, error: 'invalidFormat' };
    }

    if (startTime >= endTime) {
      return { isValid: false, error: 'startAfterEnd' };
    }

    if (endTime > new Date(now.getTime() + 60000)) {
      return { isValid: false, error: 'futureEnd' };
    }

    const maxDuration = 365 * 24 * 60 * 60 * 1000;
    if (endTime.getTime() - startTime.getTime() > maxDuration) {
      return { isValid: false, error: 'rangeTooLarge' };
    }

    const minDuration = 60 * 1000;
    if (endTime.getTime() - startTime.getTime() < minDuration) {
      return { isValid: false, error: 'rangeTooSmall' };
    }

    const tenYearsAgo = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);
    if (startTime < tenYearsAgo) {
      return { isValid: false, error: 'tooFarBack' };
    }

    return { isValid: true };
  }

  static validateLocationFilter(lat, lng, radius) {
    if (isNaN(lat) || isNaN(lng)) {
      return { isValid: false, error: 'validLocationRequired' };
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { isValid: false, error: 'invalidCoordinates' };
    }

    if (isNaN(radius) || radius <= 0) {
      return { isValid: false, error: 'invalidRadius' };
    }

    return { isValid: true };
  }
}
