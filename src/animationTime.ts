let animationStartTime = 0;

export function resetAnimationStartTime() {
  animationStartTime = performance.now();
}

export function animationTime() {
  return performance.now() - animationStartTime;
}
