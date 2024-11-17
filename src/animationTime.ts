let animationStartTime = 0;

export function resetRelativeAnimationStartTime() {
  animationStartTime = performance.now();
}

// Use this for animations that should be reset on state changes.
export function relativeAnimationTime() {
  return performance.now() - animationStartTime;
}

// Use this for animations that should not reset on state changes.
export function absoluteAnimationTime() {
    return performance.now();
}
